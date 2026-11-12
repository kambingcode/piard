import "server-only";

import { z } from "zod";
import { chosenTech, type Plan, planTitle } from "@/features/plans";
import type { PlansService } from "@/features/plans/server";
import type { PrdService } from "@/features/prd/server";
import type { RoadmapFeature, RoadmapSubFeature } from "@/features/roadmap";
import type { RoadmapService } from "@/features/roadmap/server";
import type { TasksService } from "@/features/tasks/server";
import { type AiClient, blocksFurtherCalls } from "@/server/ai";
import { AppError } from "@/server/http/errors";
import type { JobHandler, JobRecord, JobRunner } from "@/server/jobs";
import { mockSpec, mockTasks } from "../ai/build.mock";
import {
  type BuildFeature,
  type BuildPromptInput,
  buildSpecPrompt,
  buildTasksPrompt,
} from "../ai/build.prompt";
import { specOutputSchema, tasksOutputSchema } from "../ai/build.schema";
import { specsCopy } from "../copy";
import {
  BUILD_CONCURRENCY,
  BUILD_PHASES,
  type BuildJobEvent,
  type BuildPhase,
  type BuildState,
  type BuildStatus,
} from "../schemas";
import { renderSpec } from "../spec-markdown";
import { renderTaskPrompt } from "../task-prompt";

/** Jenis job: seluruh plan, atau task satu fitur. */
export const BUILD_JOB = "build";
export const FEATURE_TASKS_JOB = "feature-tasks";
/** Menyusun ulang spesifikasi & task fitur yang berubah sesudah usulan diterima (R14). */
export const SYNC_TASKS_JOB = "sync-tasks";
const KINDS = [BUILD_JOB, FEATURE_TASKS_JOB, SYNC_TASKS_JOB];

const buildPayloadSchema = z.object({ userId: z.string().min(1) });
const featurePayloadSchema = z.object({
  userId: z.string().min(1),
  featureId: z.string().min(1),
});

type Deps = {
  plans: PlansService;
  roadmap: Pick<
    RoadmapService,
    "getRoadmap" | "getFeature" | "writeSpecs" | "clearSpecs"
  >;
  prd: Pick<PrdService, "getPrd">;
  tasks: Pick<TasksService, "countByFeature" | "replaceForFeature" | "clearPlan">;
  ai: AiClient;
  jobs: Pick<JobRunner, "enqueue" | "latestFor" | "subscribe" | "get">;
  concurrency?: number;
  /** Dokumentasi proyek eksisting untuk prompt plan fitur baru (M7-19); bawaan: tanpa konteks. */
  codebaseContext?: (userId: string, codebaseId: string | null) => string;
};

const isActive = (job: JobRecord | undefined) =>
  job !== undefined && (job.state === "queued" || job.state === "running");

function phaseOf(job: JobRecord): BuildPhase {
  if (job.state === "queued") return "queued";
  return BUILD_PHASES.find((p) => p === job.progress.phase) ?? "reading";
}

/** Job terbaru dari kedua jenis (seluruh plan atau satu fitur). */
function latestOf(jobs: Deps["jobs"], planId: string): JobRecord | undefined {
  return KINDS.map((kind) => jobs.latestFor(planId, kind))
    .filter((job): job is JobRecord => job !== undefined)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

/**
 * Menjalankan `work` untuk tiap item dengan paling banyak `limit` sekaligus; berhenti mengambil item
 * baru bila dibatalkan atau `halted()` bernilai true.
 */
async function pool<T>(
  items: T[],
  limit: number,
  signal: AbortSignal,
  work: (item: T) => Promise<void>,
  halted: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted && !halted()) {
      const item = items[next++];
      if (item !== undefined) await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

type FeatureTree = { feature: RoadmapFeature; subs: RoadmapSubFeature[] };

/** Spesifikasi dan task per fitur (doc 07 bagian 8.4-8.5), job berprogres, dan event SSE. */
export function createSpecsService({
  plans,
  roadmap,
  prd,
  tasks,
  ai,
  jobs,
  concurrency = BUILD_CONCURRENCY,
  codebaseContext = () => "",
}: Deps) {
  function trees(userId: string, planId: string): FeatureTree[] {
    const state = roadmap.getRoadmap(userId, planId);
    return state.features.map((feature) => ({
      feature,
      subs: state.subFeatures.filter((s) => s.parentId === feature.id),
    }));
  }

  /** Fitur lengkap = spesifikasi fitur dan semua sub-fiturnya terisi, dan punya task. */
  function incomplete(planId: string, all: FeatureTree[]): FeatureTree[] {
    const counts = tasks.countByFeature(planId);
    return all.filter(
      ({ feature, subs }) =>
        feature.spec.trim() === "" ||
        subs.some((s) => s.spec.trim() === "") ||
        (counts.get(feature.id) ?? 0) === 0,
    );
  }

  /** Plan, PRD terbaru, dan fitur. @throws CONFLICT bila PRD/roadmap belum siap. */
  function inputs(userId: string, planId: string) {
    const { plan } = plans.getPlan(userId, planId);
    const roadmapState = roadmap.getRoadmap(userId, plan.id);
    if (roadmapState.status === "generating")
      throw new AppError("CONFLICT", specsCopy.errors.roadmapGenerating);
    const prdState = prd.getPrd(userId, plan.id);
    if (prdState.status === "generating")
      throw new AppError("CONFLICT", specsCopy.errors.prdGenerating);
    if (!prdState.document) throw new AppError("CONFLICT", specsCopy.errors.noPrd);
    const all = trees(userId, plan.id);
    if (all.length === 0) throw new AppError("CONFLICT", specsCopy.errors.noFeatures);
    return { plan, prd: prdState.document.content, all };
  }

  function promptInput(
    plan: Plan,
    prdContent: string,
    all: FeatureTree[],
    tree: FeatureTree,
  ): BuildPromptInput {
    const feature: BuildFeature = {
      name: tree.feature.name,
      summary: tree.feature.summary,
      phase: tree.feature.phase,
      subFeatures: tree.subs.map((s) => ({ name: s.name, summary: s.summary })),
    };
    return {
      ...plan,
      title: planTitle(plan),
      prd: prdContent,
      allFeatures: all.map((t) => t.feature.name),
      feature,
      codebaseContext: codebaseContext(plan.userId, plan.codebaseId),
    };
  }

  /**
   * Menyusun satu fitur: spesifikasi (bila belum ada atau `force`), lalu task. Disimpan per langkah:
   * spesifikasi dulu, kemudian task, sehingga job yang diulang tidak menulis ulang spesifikasi.
   * @returns true bila spesifikasi ditulis ulang (fitur tidak lagi basi).
   */
  async function buildFeature(args: {
    userId: string;
    jobId: string;
    plan: Plan;
    prd: string;
    all: FeatureTree[];
    tree: FeatureTree;
    forceSpec: boolean;
    signal: AbortSignal;
  }): Promise<boolean> {
    const { plan, tree } = args;
    const input = promptInput(plan, args.prd, args.all, tree);
    const context = { userId: args.userId, planId: plan.id, refId: args.jobId };

    let spec = tree.feature.spec;
    let subSpecs = tree.subs.map((s) => ({ id: s.id, name: s.name, spec: s.spec }));
    const needsSpec =
      args.forceSpec || spec.trim() === "" || subSpecs.some((s) => s.spec.trim() === "");
    if (needsSpec) {
      const { system, prompt } = buildSpecPrompt(input);
      const { data } = await ai.generateStructured({
        ...context,
        task: "spec",
        system,
        prompt,
        schema: specOutputSchema,
        mock: () => mockSpec(plan.language, input.feature),
        abortSignal: args.signal,
      });
      spec = renderSpec(plan.language, data.feature);
      // Cocokkan sub-fitur menurut nama (abaikan huruf besar), lalu menurut urutan.
      const byName = new Map(
        data.subFeatures.map((s) => [s.name.trim().toLowerCase(), s]),
      );
      subSpecs = tree.subs.map((s, index) => {
        const out = byName.get(s.name.trim().toLowerCase()) ?? data.subFeatures[index];
        return {
          id: s.id,
          name: s.name,
          spec: out ? renderSpec(plan.language, out) : s.spec,
        };
      });
      roadmap.writeSpecs(plan.id, [
        { id: tree.feature.id, spec },
        ...subSpecs
          .filter((s) => s.spec.trim() !== "")
          .map(({ id, spec: text }) => ({
            id,
            spec: text,
          })),
      ]);
    }
    if (args.signal.aborted) return needsSpec;

    const { system, prompt } = buildTasksPrompt({
      ...input,
      spec,
      subSpecs: subSpecs.filter((s) => s.spec.trim() !== ""),
    });
    const { data } = await ai.generateStructured({
      ...context,
      task: "tasks",
      system,
      prompt,
      schema: tasksOutputSchema,
      mock: () => mockTasks(plan.language, input.feature),
      abortSignal: args.signal,
    });
    if (args.signal.aborted) return needsSpec;
    const promptContext = {
      language: plan.language,
      product: planTitle(plan),
      feature: tree.feature.name,
      phase: tree.feature.phase,
      tech: chosenTech(plan.techStack),
      spec,
    };
    tasks.replaceForFeature(
      plan.id,
      tree.feature.id,
      data.tasks.map((task) => ({
        title: task.title,
        description: task.description,
        prompt: renderTaskPrompt(promptContext, task),
      })),
    );
    return needsSpec;
  }

  /** Menghapus fitur dari daftar basi setelah spesifikasi dan task-nya disusun ulang. */
  function markFresh(userId: string, planId: string, featureIds: string[]) {
    const fresh = new Set(featureIds);
    plans.updateSync(userId, planId, (sync) => ({
      ...sync,
      staleFeatureIds: sync.staleFeatureIds.filter((id) => !fresh.has(id)),
    }));
  }

  /** Fitur basi yang masih ada di roadmap. */
  function staleOf(userId: string, planId: string, all: FeatureTree[]): FeatureTree[] {
    const stale = new Set(plans.getSync(userId, planId).staleFeatureIds);
    return all.filter((t) => stale.has(t.feature.id));
  }

  /**
   * Menyusun banyak fitur dengan paralel terbatas. Fitur yang gagal tidak menghentikan yang lain,
   * kecuali galat yang pasti berulang (kunci ditolak, kuota habis). Di akhir, kegagalan dilempar
   * sebagai satu ringkasan sehingga "Lanjutkan" hanya mengulang yang gagal.
   */
  async function buildMany(args: {
    ctx: Parameters<JobHandler>[0];
    userId: string;
    plan: Plan;
    prd: string;
    all: FeatureTree[];
    todo: FeatureTree[];
    forceSpec: boolean;
    done: number;
  }): Promise<void> {
    const { ctx, userId, plan, todo } = args;
    const { signal, progress, logger } = ctx;
    let done = args.done;
    const failures: unknown[] = [];
    // Kunci ditolak, saldo/kuota habis: fitur berikutnya pasti gagal juga, jadi berhenti lebih awal.
    let blocked = false;
    const startedDone = done;
    await pool(
      todo,
      concurrency,
      signal,
      async (tree) => {
        try {
          const rebuilt = await buildFeature({
            userId,
            jobId: ctx.job.id,
            plan,
            prd: args.prd,
            all: args.all,
            tree,
            forceSpec: args.forceSpec,
            signal,
          });
          if (signal.aborted) return;
          if (rebuilt) markFresh(userId, plan.id, [tree.feature.id]);
          done += 1;
          progress({ done });
        } catch (error) {
          if (signal.aborted) return;
          failures.push(error);
          blocked ||= blocksFurtherCalls(error);
          logger.warn("fitur gagal disusun", {
            planId: plan.id,
            feature: tree.feature.id,
            error,
          });
        }
      },
      () => blocked,
    );
    if (signal.aborted || failures.length === 0) return;
    const first = failures[0];
    const reason = first instanceof AppError ? first.message : specsCopy.errors.failed;
    const remaining = todo.length - (done - startedDone);
    throw new AppError(
      "UPSTREAM_AI",
      blocked
        ? specsCopy.errors.blocked(remaining, todo.length, reason)
        : specsCopy.errors.partialFailure(failures.length, todo.length, reason),
    );
  }

  /**
   * Job seluruh plan. Idempoten dan bisa dilanjutkan: hanya fitur yang belum lengkap yang dikerjakan,
   * dan tiap fitur disimpan begitu selesai. Fitur yang gagal tidak menghentikan fitur lain; di akhir
   * job gagal dengan ringkasan sehingga "Lanjutkan" hanya mengulang yang gagal.
   */
  const runBuildJob: JobHandler = async (ctx) => {
    const { job, signal, progress, logger } = ctx;
    const { userId } = buildPayloadSchema.parse(job.payload);
    if (!job.planId) throw new Error("Job build tanpa planId");
    progress({ phase: "reading", done: 0, total: 0 });
    const { plan, prd: prdContent } = inputs(userId, job.planId);

    progress({ phase: "features" });
    const all = trees(userId, plan.id);
    const todo = incomplete(plan.id, all);
    const done = all.length - todo.length;
    progress({ phase: "enrich", done, total: all.length });
    await buildMany({
      ctx,
      userId,
      plan,
      prd: prdContent,
      all,
      todo,
      forceSpec: false,
      done,
    });
    if (signal.aborted) return;
    progress({ phase: "done", done: all.length, total: all.length });
    logger.info("spesifikasi & task selesai", { planId: plan.id, features: todo.length });
  };

  /**
   * Job penyesuaian: spesifikasi & task fitur basi disusun ulang (spesifikasi ditulis ulang dari data
   * fitur terbaru). Bisa dilanjutkan: fitur dihapus dari daftar basi begitu selesai.
   */
  const runSyncTasksJob: JobHandler = async (ctx) => {
    const { job, progress, logger } = ctx;
    const { userId } = buildPayloadSchema.parse(job.payload);
    if (!job.planId) throw new Error("Job penyesuaian task tanpa planId");
    progress({ phase: "reading", done: 0, total: 0 });
    const { plan, prd: prdContent, all } = inputs(userId, job.planId);
    const todo = staleOf(userId, plan.id, all);
    progress({ phase: "enrich", done: 0, total: todo.length });
    await buildMany({
      ctx,
      userId,
      plan,
      prd: prdContent,
      all,
      todo,
      forceSpec: true,
      done: 0,
    });
    if (ctx.signal.aborted) return;
    progress({ phase: "done", done: todo.length, total: todo.length });
    logger.info("task fitur yang berubah disesuaikan", {
      planId: plan.id,
      features: todo.length,
    });
  };

  /** Job task satu fitur: spesifikasi ikut disusun bila belum ada. */
  const runFeatureTasksJob: JobHandler = async ({ job, signal, progress }) => {
    const { userId, featureId } = featurePayloadSchema.parse(job.payload);
    if (!job.planId) throw new Error("Job task tanpa planId");
    progress({ phase: "reading", done: 0, total: 1 });
    const { plan, prd: prdContent, all } = inputs(userId, job.planId);
    const tree = all.find((t) => t.feature.id === featureId);
    if (!tree) throw new AppError("NOT_FOUND", specsCopy.errors.featureNotFound);
    progress({ phase: "enrich" });
    await buildFeature({
      userId,
      jobId: job.id,
      plan,
      prd: prdContent,
      all,
      tree,
      forceSpec: false,
      signal,
    });
    if (!signal.aborted) progress({ phase: "done", done: 1 });
  };

  function stateOf(userId: string, planId: string): BuildState {
    const all = trees(userId, planId);
    const missing = incomplete(planId, all);
    const job = latestOf(jobs, planId);
    const doneFeatures = all.length - missing.length;
    let status: BuildStatus;
    if (isActive(job)) status = "generating";
    else if (all.length > 0 && missing.length === 0) status = "ready";
    else if (job?.state === "failed" || job?.state === "cancelled") status = "failed";
    else status = doneFeatures > 0 ? "partial" : "idle";
    return {
      status,
      totalFeatures: all.length,
      doneFeatures,
      incompleteFeatureIds: missing.map((t) => t.feature.id),
      staleFeatureIds: staleOf(userId, planId, all).map((t) => t.feature.id),
      job: job
        ? {
            id: job.id,
            kind: job.kind,
            phase: phaseOf(job),
            error:
              status !== "failed"
                ? null
                : job.state === "cancelled"
                  ? specsCopy.errors.cancelled
                  : (job.error ?? specsCopy.errors.failed),
          }
        : null,
    };
  }

  function toEvent(job: JobRecord): BuildJobEvent {
    const payload = featurePayloadSchema.safeParse(job.payload);
    return {
      jobId: job.id,
      kind: job.kind,
      phase: phaseOf(job),
      status:
        job.state === "queued"
          ? "queued"
          : job.state === "running"
            ? "running"
            : job.state === "succeeded"
              ? "done"
              : "error",
      totalFeatures: job.progress.total,
      doneFeatures: job.progress.done,
      featureId: payload.success ? payload.data.featureId : null,
      error: job.state === "failed" ? (job.error ?? specsCopy.errors.failed) : null,
    };
  }

  return {
    runBuildJob,
    runFeatureTasksJob,
    runSyncTasksJob,

    /** Keadaan untuk halaman dan `GET /api/plan/generation/status`. */
    getBuild(userId: string, planId: string): BuildState {
      const { plan } = plans.getPlan(userId, planId);
      return stateOf(userId, plan.id);
    },

    /**
     * Memulai job seluruh plan. Tidak membuat job baru bila sudah ada yang berjalan atau semua fitur
     * lengkap (kecuali `regenerate`, yang mengosongkan spesifikasi dan task lebih dulu).
     */
    startBuild(
      userId: string,
      planId: string,
      { regenerate = false }: { regenerate?: boolean } = {},
    ): { status: BuildStatus } {
      const { plan } = plans.getPlan(userId, planId);
      if (isActive(latestOf(jobs, plan.id))) return { status: "generating" };
      const { all } = inputs(userId, plan.id);
      if (!regenerate && incomplete(plan.id, all).length === 0)
        return { status: "ready" };
      if (regenerate) {
        roadmap.clearSpecs(plan.id);
        tasks.clearPlan(plan.id);
        markFresh(
          userId,
          plan.id,
          all.map((t) => t.feature.id),
        );
      }
      jobs.enqueue({ kind: BUILD_JOB, planId: plan.id, payload: { userId } });
      return { status: "generating" };
    },

    /** Memulai penyesuaian fitur basi ("Sesuaikan task"); tidak apa-apa bila tidak ada yang basi. */
    startSyncTasks(userId: string, planId: string): { status: BuildStatus } {
      const { plan } = plans.getPlan(userId, planId);
      if (isActive(latestOf(jobs, plan.id))) return { status: "generating" };
      const { all } = inputs(userId, plan.id);
      if (staleOf(userId, plan.id, all).length === 0)
        return { status: stateOf(userId, plan.id).status };
      jobs.enqueue({ kind: SYNC_TASKS_JOB, planId: plan.id, payload: { userId } });
      return { status: "generating" };
    },

    /** Menyusun ulang task satu fitur (spesifikasi ikut dibuat bila belum ada). */
    startFeatureTasks(userId: string, featureId: string): { status: BuildStatus } {
      const feature = roadmap.getFeature(userId, featureId);
      if (isActive(latestOf(jobs, feature.planId))) return { status: "generating" };
      inputs(userId, feature.planId);
      jobs.enqueue({
        kind: FEATURE_TASKS_JOB,
        planId: feature.planId,
        payload: { userId, featureId: feature.id },
      });
      return { status: "generating" };
    },

    /**
     * Berlangganan event job plan (SSE). Event pertama dikirim segera dari job terbaru, bila ada.
     * @returns fungsi berhenti berlangganan.
     */
    subscribe(
      userId: string,
      planId: string,
      listener: (event: BuildJobEvent) => void,
    ): () => void {
      const { plan } = plans.getPlan(userId, planId);
      const unsubscribers = KINDS.map((kind) =>
        jobs.subscribe(
          (event) => {
            const job = jobs.get(event.jobId);
            if (job) listener(toEvent(job));
          },
          { planId: plan.id, kind },
        ),
      );
      const latest = latestOf(jobs, plan.id);
      if (latest) listener(toEvent(latest));
      return () => {
        for (const stop of unsubscribers) stop();
      };
    },
  };
}

export type SpecsService = ReturnType<typeof createSpecsService>;
