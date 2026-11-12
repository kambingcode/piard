import "server-only";

import { z } from "zod";
import { planTitle } from "@/features/plans";
import type { PlansService } from "@/features/plans/server";
import type { AiClient } from "@/server/ai";
import { AppError } from "@/server/http/errors";
import type { JobHandler, JobRecord, JobRunner } from "@/server/jobs";
import { mockRoadmap, mockRoadmapPartials } from "../ai/roadmap.mock";
import {
  clip,
  completedFeatures,
  finalOrder,
  type NormalizedFeature,
  normalizeFeature,
} from "../ai/roadmap.normalize";
import { buildRoadmapPrompt } from "../ai/roadmap.prompt";
import { type RoadmapOutput, roadmapOutputSchema } from "../ai/roadmap.schema";
import { roadmapCopy } from "../copy";
import { resolveIcon } from "../icons";
import {
  type AppliedChanges,
  type CreateFeatureInput,
  type CreateSubFeatureInput,
  type FeatureChange,
  MAX_PHASE,
  NAME_MAX_LENGTH,
  type PatchFeatureInput,
  type PatchSubFeatureInput,
  ROADMAP_PHASES,
  type RoadmapFeature,
  type RoadmapPhase,
  type RoadmapState,
  type RoadmapStatus,
  type RoadmapSubFeature,
  SUMMARY_MAX_LENGTH,
} from "../schemas";
import type { FeatureRow, RoadmapRepo } from "./repo";

/** Jenis job di tabel `jobs`. */
export const ROADMAP_JOB = "roadmap";

const jobPayloadSchema = z.object({ userId: z.string().min(1) });

type Deps = {
  /** Dokumentasi proyek eksisting untuk prompt plan fitur baru (M7-19); bawaan: tanpa konteks. */
  codebaseContext?: (userId: string, codebaseId: string | null) => string;
  plans: PlansService;
  repo: RoadmapRepo;
  ai: AiClient;
  jobs: Pick<JobRunner, "enqueue" | "latestFor">;
  /** Mode mock: jeda antar fitur agar kemunculan bertahap terlihat di dev dan e2e. */
  mockDelayMs?: number;
};

function toFeature(row: FeatureRow): RoadmapFeature {
  return {
    id: row.id,
    planId: row.planId,
    workspaceId: row.workspaceId,
    parentId: row.parentId,
    name: row.name,
    summary: row.summary,
    icon: row.icon,
    status: row.status,
    priority: row.priority,
    phase: row.phase,
    spec: row.spec,
    isDraft: row.isDraft,
    source: row.source,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Sub-fitur membawa `featureId` = `parentId` (kontrak situs acuan, tests/contract). */
function toSubFeature(row: FeatureRow & { parentId: string }): RoadmapSubFeature {
  return { ...toFeature(row), parentId: row.parentId, featureId: row.parentId };
}

const isSub = (row: FeatureRow): row is FeatureRow & { parentId: string } =>
  row.parentId !== null;

const isActive = (job: JobRecord | undefined) =>
  job !== undefined && (job.state === "queued" || job.state === "running");

function phaseOf(job: JobRecord): RoadmapPhase {
  if (job.state === "queued") return "queued";
  const phase = ROADMAP_PHASES.find((p) => p === job.progress.phase);
  return phase ?? "reading";
}

function statusOf(job: JobRecord | undefined, hasFeatures: boolean): RoadmapStatus {
  if (isActive(job)) return "generating";
  if (job?.state === "failed" || job?.state === "cancelled") return "failed";
  return hasFeatures ? "ready" : "idle";
}

const notFound = () => new AppError("NOT_FOUND", roadmapCopy.errors.featureNotFound);

/** Roadmap: job AI yang menyusun fitur, keadaan untuk polling, dan CRUD fitur/sub-fitur. */
export function createRoadmapService({
  plans,
  repo,
  ai,
  jobs,
  mockDelayMs = 0,
  codebaseContext = () => "",
}: Deps) {
  function assertEditable(planId: string) {
    if (isActive(jobs.latestFor(planId, ROADMAP_JOB))) {
      throw new AppError("CONFLICT", roadmapCopy.errors.generating);
    }
  }

  function ownedFeature(userId: string, id: string): FeatureRow {
    const row = repo.findOwned(userId, id);
    if (!row || row.parentId !== null) throw notFound();
    return row;
  }

  function ownedSubFeature(
    userId: string,
    id: string,
  ): FeatureRow & { parentId: string } {
    const row = repo.findOwned(userId, id);
    if (!row || !isSub(row)) throw notFound();
    return row;
  }

  /**
   * Menjalankan satu job roadmap. Idempoten: selalu mulai dari roadmap kosong, jadi aman diulang
   * setelah proses mati (satu aliran LLM tidak bisa dilanjutkan dari tengah). Setiap fitur disimpan
   * begitu lengkap sehingga polling melihat node bertambah; urutan dan fase dirapikan di akhir.
   */
  const runJob: JobHandler = async ({ job, signal, progress, logger }) => {
    const { userId } = jobPayloadSchema.parse(job.payload);
    if (!job.planId) throw new Error("Job roadmap tanpa planId");
    const { plan } = plans.getPlan(userId, job.planId);
    const owner = { planId: plan.id, workspaceId: plan.workspaceId };

    progress({ phase: "reading", done: 0, total: 0 });
    repo.clearPlan(plan.id);

    const savedIds: string[] = [];
    const save = (items: NormalizedFeature[]) => {
      for (let index = savedIds.length; index < items.length; index++) {
        const item = items[index];
        if (!item) break;
        savedIds.push(repo.insertTree(owner, index, item));
      }
    };

    const { system, prompt } = buildRoadmapPrompt({
      ...plan,
      codebaseContext: codebaseContext(userId, plan.codebaseId),
    });
    const { data } = await ai.streamStructured<RoadmapOutput>({
      task: "roadmap",
      userId,
      planId: plan.id,
      refId: job.id,
      system,
      prompt,
      schema: roadmapOutputSchema,
      mock: () => mockRoadmap(plan.language, planTitle(plan)),
      mockPartials: mockRoadmapPartials,
      mockDelayMs,
      abortSignal: signal,
      onPartial: (partial) => {
        const before = savedIds.length;
        save(completedFeatures(partial).map(normalizeFeature));
        if (savedIds.length !== before)
          progress({ phase: "features", done: savedIds.length });
      },
    });
    if (signal.aborted) return;

    progress({ phase: "finishing", done: savedIds.length });
    const final = data.features.map(normalizeFeature);
    save(final);
    const { order, phases } = finalOrder(final.map((f) => f.phase));
    repo.applyOrder(
      order.map((original, position) => ({
        id: savedIds[original] ?? "",
        position,
        phase: phases[original] ?? 1,
      })),
    );
    plans.recordRoadmap(userId, plan.id, {
      title: clip(data.title, NAME_MAX_LENGTH),
      totalPhases: Math.max(...phases),
    });
    progress({ phase: "done", done: final.length, total: final.length });
    logger.info("roadmap selesai", { planId: plan.id, features: final.length });
  };

  return {
    runJob,

    /** Keadaan roadmap untuk halaman dan polling `GET /api/plan/roadmap/generate`. */
    getRoadmap(userId: string, planId: string): RoadmapState {
      const { plan } = plans.getPlan(userId, planId);
      const rows = repo.listByPlan(plan.id);
      const job = jobs.latestFor(plan.id, ROADMAP_JOB);
      const top = rows.filter((row) => row.parentId === null);
      return {
        status: statusOf(job, top.length > 0),
        title: plan.title,
        features: top.map(toFeature),
        subFeatures: rows.filter(isSub).map(toSubFeature),
        job: job
          ? {
              id: job.id,
              phase: phaseOf(job),
              done: job.progress.done,
              error:
                job.state === "failed"
                  ? (job.error ?? roadmapCopy.errors.failed)
                  : job.state === "cancelled"
                    ? roadmapCopy.errors.cancelled
                    : null,
            }
          : null,
      };
    },

    /**
     * Memulai job roadmap. Tidak membuat job baru bila sudah ada yang berjalan, atau bila
     * roadmap lengkap sudah ada dan tidak diminta membuat ulang (klik ganda tidak menggandakan
     * biaya). Setelah job gagal, panggilan ini mengulangnya.
     */
    startRoadmap(
      userId: string,
      planId: string,
      { regenerate = false }: { regenerate?: boolean } = {},
    ): { status: RoadmapStatus } {
      const { plan } = plans.getPlan(userId, planId);
      const latest = jobs.latestFor(plan.id, ROADMAP_JOB);
      if (isActive(latest)) return { status: "generating" };
      // Roadmap hasil job gagal hanya parsial, jadi "Coba lagi" selalu mengulang job.
      const complete = statusOf(latest, repo.countTopLevel(plan.id) > 0) === "ready";
      if (!regenerate && complete) return { status: "ready" };
      jobs.enqueue({ kind: ROADMAP_JOB, planId: plan.id, payload: { userId } });
      return { status: "generating" };
    },

    listFeatures(userId: string, planId: string): RoadmapFeature[] {
      const { plan } = plans.getPlan(userId, planId);
      return repo
        .listByPlan(plan.id)
        .filter((row) => row.parentId === null)
        .map(toFeature);
    },

    listSubFeatures(
      userId: string,
      planId: string,
      featureId?: string,
    ): RoadmapSubFeature[] {
      const { plan } = plans.getPlan(userId, planId);
      return repo
        .listByPlan(plan.id)
        .filter(isSub)
        .filter((row) => featureId === undefined || row.parentId === featureId)
        .map(toSubFeature);
    },

    createFeature(userId: string, input: CreateFeatureInput): RoadmapFeature {
      const { plan } = plans.getPlan(userId, input.planId);
      assertEditable(plan.id);
      return toFeature(
        repo.insertOne({
          planId: plan.id,
          workspaceId: plan.workspaceId,
          parentId: null,
          name: input.name,
          summary: input.summary,
          icon: resolveIcon(null, input.name),
          phase: input.phase ?? repo.lastPhase(plan.id) ?? 1,
          position: repo.nextPosition(plan.id, null),
        }),
      );
    },

    createSubFeature(userId: string, input: CreateSubFeatureInput): RoadmapSubFeature {
      const parent = ownedFeature(userId, input.featureId);
      assertEditable(parent.planId);
      const row = repo.insertOne({
        planId: parent.planId,
        workspaceId: parent.workspaceId,
        parentId: parent.id,
        name: input.name,
        summary: input.summary,
        icon: resolveIcon(null, input.name),
        phase: parent.phase,
        position: repo.nextPosition(parent.planId, parent.id),
      });
      if (!isSub(row)) throw new Error("Sub-fitur tanpa induk");
      return toSubFeature(row);
    },

    updateFeature(userId: string, id: string, patch: PatchFeatureInput): RoadmapFeature {
      const row = ownedFeature(userId, id);
      assertEditable(row.planId);
      const updated = repo.update(row.id, patch);
      if (!updated) throw notFound();
      return toFeature(updated);
    },

    updateSubFeature(
      userId: string,
      id: string,
      patch: PatchSubFeatureInput,
    ): RoadmapSubFeature {
      const row = ownedSubFeature(userId, id);
      assertEditable(row.planId);
      const updated = repo.update(row.id, patch);
      if (!updated || !isSub(updated)) throw notFound();
      return toSubFeature(updated);
    },

    deleteFeature(userId: string, id: string): void {
      const row = ownedFeature(userId, id);
      assertEditable(row.planId);
      if (!repo.delete(row.id)) throw notFound();
    },

    /** Fitur level atas milik pengguna. @throws NOT_FOUND bila tidak ada atau berupa sub-fitur. */
    getFeature(userId: string, id: string): RoadmapFeature {
      return toFeature(ownedFeature(userId, id));
    },

    /** Dipakai job spesifikasi (sesudah kepemilikan plan diperiksa). @returns jumlah baris berubah. */
    writeSpecs(planId: string, specs: { id: string; spec: string }[]): number {
      return repo.setSpecs(planId, specs);
    },

    /** Dipakai "buat ulang" spesifikasi: mengosongkan spesifikasi semua fitur plan. */
    clearSpecs(planId: string): void {
      repo.clearSpecs(planId);
    },

    /**
     * Menerapkan usulan perubahan fitur dalam satu transaksi. `update`/`remove` untuk fitur yang
     * sudah tidak ada di plan dilewati (usulan bisa lebih tua dari suntingan terakhir). Fitur baru
     * ditaruh di akhir dengan sumber `ai`.
     */
    applyChanges(
      userId: string,
      planId: string,
      changes: FeatureChange[],
    ): AppliedChanges {
      const { plan } = plans.getPlan(userId, planId);
      assertEditable(plan.id);
      const owner = { planId: plan.id, workspaceId: plan.workspaceId };
      const phaseOf = (phase: number | null | undefined) =>
        phase === null || phase === undefined
          ? null
          : Math.min(Math.max(Math.round(phase), 1), MAX_PHASE);
      const topLevel = (id: string) => {
        const row = repo.findOwned(userId, id);
        return row && row.planId === plan.id && row.parentId === null ? row : undefined;
      };

      return repo.atomic(() => {
        const changedIds: string[] = [];
        const removedIds: string[] = [];
        for (const change of changes) {
          if (change.op === "add") {
            const name = clip(change.name, NAME_MAX_LENGTH);
            const id = repo.insertTree(owner, repo.nextPosition(plan.id, null), {
              name,
              summary: clip(change.summary, SUMMARY_MAX_LENGTH),
              icon: resolveIcon(null, name),
              phase: phaseOf(change.phase) ?? repo.lastPhase(plan.id) ?? 1,
              subFeatures: change.subFeatures.map((sub) => {
                const subName = clip(sub.name, NAME_MAX_LENGTH);
                return {
                  name: subName,
                  summary: clip(sub.summary, SUMMARY_MAX_LENGTH),
                  icon: resolveIcon(null, subName),
                };
              }),
            });
            changedIds.push(id);
          } else if (change.op === "update") {
            const row = topLevel(change.featureId);
            if (!row) continue;
            const patch = {
              name: change.name ? clip(change.name, NAME_MAX_LENGTH) : undefined,
              summary:
                change.summary !== undefined
                  ? clip(change.summary, SUMMARY_MAX_LENGTH)
                  : undefined,
              phase: phaseOf(change.phase) ?? undefined,
            };
            if (Object.values(patch).every((value) => value === undefined)) continue;
            repo.update(row.id, patch);
            changedIds.push(row.id);
          } else {
            const row = topLevel(change.featureId);
            if (row && repo.delete(row.id)) removedIds.push(row.id);
          }
        }
        return { changedIds, removedIds };
      });
    },

    deleteSubFeature(userId: string, id: string): void {
      const row = ownedSubFeature(userId, id);
      assertEditable(row.planId);
      if (!repo.delete(row.id)) throw notFound();
    },
  };
}

export type RoadmapService = ReturnType<typeof createRoadmapService>;
