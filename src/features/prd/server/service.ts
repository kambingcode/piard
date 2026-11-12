import "server-only";

import { z } from "zod";
import { planTitle } from "@/features/plans";
import type { PlansService } from "@/features/plans/server";
import type { RoadmapService } from "@/features/roadmap/server";
import { slugify } from "@/lib/slug";
import type { AiClient } from "@/server/ai";
import { AppError } from "@/server/http/errors";
import type { JobHandler, JobRecord, JobRunner } from "@/server/jobs";
import { mockPrd, mockRevision } from "../ai/prd.mock";
import { buildPrdPrompt, type PrdPromptInput } from "../ai/prd.prompt";
import { buildRevisePrompt } from "../ai/revise.prompt";
import { prdCopy } from "../copy";
import {
  PRD_PHASES,
  type PrdDocument,
  type PrdJobKind,
  type PrdPhase,
  type PrdState,
  type PrdStatus,
  type PrdVersion,
} from "../schemas";
import {
  checkPrdStructure,
  cleanPrd,
  foundSections,
  PRD_SECTION_COUNT,
  type PrdStructure,
} from "../structure";
import type { DraftStore } from "./drafts";
import type { DocumentRow, PrdRepo } from "./repo";

/** Jenis job di tabel `jobs`: menulis PRD dari roadmap, atau merevisi PRD terbaru (R13). */
export const PRD_JOB = "prd";
export const PRD_REVISE_JOB = "prd-revise";
const KINDS = [PRD_JOB, PRD_REVISE_JOB];

const jobPayloadSchema = z.object({ userId: z.string().min(1) });
const revisePayloadSchema = z.object({
  userId: z.string().min(1),
  instructions: z.string().min(1),
});

type Deps = {
  plans: PlansService;
  roadmap: Pick<RoadmapService, "getRoadmap">;
  repo: PrdRepo;
  ai: AiClient;
  jobs: Pick<JobRunner, "enqueue" | "latestFor">;
  drafts: DraftStore;
  /** Dokumentasi proyek eksisting untuk prompt plan fitur baru (M7-19); bawaan: tanpa konteks. */
  codebaseContext?: (userId: string, codebaseId: string | null) => string;
};

/** Job PRD terbaru dari kedua jenis. */
function latestOf(jobs: Deps["jobs"], planId: string): JobRecord | undefined {
  return KINDS.map((kind) => jobs.latestFor(planId, kind))
    .filter((job): job is JobRecord => job !== undefined)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

const kindOf = (job: JobRecord): PrdJobKind =>
  job.kind === PRD_REVISE_JOB ? "revise" : "generate";

export function toDocument(row: DocumentRow): PrdDocument {
  return {
    id: row.id,
    planId: row.planId,
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

const isActive = (job: JobRecord | undefined) =>
  job !== undefined && (job.state === "queued" || job.state === "running");

function phaseOf(job: JobRecord): PrdPhase {
  if (job.state === "queued") return "queued";
  return PRD_PHASES.find((p) => p === job.progress.phase) ?? "writing";
}

/** Kegagalan job hanya berlaku bila belum ada versi yang disimpan sesudahnya (mis. edit pengguna). */
function statusOf(
  job: JobRecord | undefined,
  latest: DocumentRow | undefined,
): PrdStatus {
  if (isActive(job)) return "generating";
  const jobFailed = job?.state === "failed" || job?.state === "cancelled";
  if (jobFailed && !(latest && latest.createdAt > job.updatedAt)) return "failed";
  return latest ? "ready" : "idle";
}

/** Bagian yang kurang, dalam kalimat untuk pesan galat. */
function describeMissing(s: PrdStructure): string {
  const parts: string[] = [];
  if (!s.hasTitle) parts.push(prdCopy.missing.title);
  if (s.missingSections.length > 0)
    parts.push(prdCopy.missing.sections(s.missingSections));
  if (!s.hasSequenceDiagram) parts.push(prdCopy.missing.sequence);
  if (!s.hasErDiagram) parts.push(prdCopy.missing.er);
  return parts.join(", ");
}

/** PRD: job AI yang menulis dokumen (dialirkan ke draf), keadaan untuk polling, dan versi. */
export function createPrdService({
  plans,
  roadmap,
  repo,
  ai,
  jobs,
  drafts,
  codebaseContext = () => "",
}: Deps) {
  /** Data prompt dari plan dan roadmap-nya. @throws CONFLICT bila roadmap belum siap. */
  function promptInput(userId: string, planId: string): PrdPromptInput {
    const { plan } = plans.getPlan(userId, planId);
    const state = roadmap.getRoadmap(userId, plan.id);
    if (state.status === "generating")
      throw new AppError("CONFLICT", prdCopy.errors.roadmapGenerating);
    if (state.features.length === 0)
      throw new AppError("CONFLICT", prdCopy.errors.noRoadmap);
    return {
      ...plan,
      title: planTitle(plan),
      codebaseContext: codebaseContext(userId, plan.codebaseId),
      features: state.features.map((f) => ({
        name: f.name,
        summary: f.summary,
        phase: f.phase,
        subFeatures: state.subFeatures
          .filter((s) => s.parentId === f.id)
          .map((s) => ({ name: s.name, summary: s.summary })),
      })),
    };
  }

  /**
   * Menjalankan satu job PRD. Idempoten: draf dimulai dari kosong dan dokumen baru hanya disimpan
   * di akhir, jadi job yang diulang setelah proses mati tidak meninggalkan versi setengah jadi.
   * PRD yang tidak lengkap (bagian atau diagram hilang) tidak disimpan; job gagal dan bisa diulang.
   */
  /**
   * Mengalirkan satu PRD utuh ke draf lalu menyimpannya sebagai versi baru. Idempoten: draf dimulai
   * dari kosong dan dokumen hanya disimpan di akhir, jadi job yang diulang setelah proses mati tidak
   * meninggalkan versi setengah jadi. PRD yang tidak lengkap (bagian atau diagram hilang) tidak
   * disimpan; job gagal dan bisa diulang. @returns versi tersimpan, atau undefined bila dibatalkan.
   */
  async function writeVersion(
    { job, signal, progress, logger }: Parameters<JobHandler>[0],
    args: {
      userId: string;
      planId: string;
      system: string;
      prompt: string;
      mock: string;
    },
  ): Promise<DocumentRow | undefined> {
    const { userId, planId } = args;
    progress({ phase: "writing", done: 0, total: PRD_SECTION_COUNT });
    drafts.set(planId, "");
    try {
      const stream = ai.streamText({
        task: "prd",
        userId,
        planId,
        refId: job.id,
        system: args.system,
        prompt: args.prompt,
        mock: args.mock,
        abortSignal: signal,
      });
      let text = "";
      let sections = 0;
      for await (const chunk of stream.textStream) {
        text += chunk;
        drafts.set(planId, text);
        const found = foundSections(text).length;
        if (found !== sections) {
          sections = found;
          progress({ done: sections });
        }
      }
      await stream.completed;
      if (signal.aborted) return undefined;

      progress({ phase: "saving" });
      const content = cleanPrd(text);
      if (content.trim() === "") throw new AppError("UPSTREAM_AI", prdCopy.errors.empty);
      const structure = checkPrdStructure(content);
      const missing = describeMissing(structure);
      if (missing) {
        logger.warn("PRD tidak lengkap", { planId, kind: job.kind, missing });
        throw new AppError("UPSTREAM_AI", prdCopy.errors.incomplete(missing));
      }
      const saved = repo.insertNextVersion(planId, content);
      progress({ phase: "done", done: PRD_SECTION_COUNT });
      logger.info("PRD tersimpan", {
        planId,
        kind: job.kind,
        version: saved.version,
        chars: content.length,
      });
      return saved;
    } finally {
      drafts.clear(planId);
    }
  }

  /** Job PRD dari roadmap. PRD hasilnya selaras dengan fitur, jadi tanda "PRD berubah" dihapus. */
  const runJob: JobHandler = async (ctx) => {
    const { userId } = jobPayloadSchema.parse(ctx.job.payload);
    if (!ctx.job.planId) throw new Error("Job PRD tanpa planId");
    const planId = ctx.job.planId;
    const input = promptInput(userId, planId);
    const saved = await writeVersion(ctx, {
      userId,
      planId,
      ...buildPrdPrompt(input),
      mock: mockPrd(input),
    });
    if (saved) {
      plans.updateSync(userId, planId, (sync) => ({
        ...sync,
        prd: { dirty: false, version: saved.version },
      }));
    }
  };

  /**
   * Job revisi: PRD terbaru ditulis ulang dengan perubahan yang diminta. Versi baru menandai PRD
   * "berubah" sehingga fitur dan task bisa disesuaikan (R14).
   */
  const runReviseJob: JobHandler = async (ctx) => {
    const { userId, instructions } = revisePayloadSchema.parse(ctx.job.payload);
    if (!ctx.job.planId) throw new Error("Job revisi PRD tanpa planId");
    const planId = ctx.job.planId;
    const current = repo.latest(planId);
    if (!current) throw new AppError("CONFLICT", prdCopy.errors.noDocument);
    const input = promptInput(userId, planId);
    const saved = await writeVersion(ctx, {
      userId,
      planId,
      ...buildRevisePrompt({
        language: input.language,
        title: input.title,
        current: current.content,
        instructions,
        features: input.features,
      }),
      mock: mockRevision(current.content, instructions),
    });
    if (saved) markChanged(userId, planId, saved.version);
  };

  function markChanged(userId: string, planId: string, version: number) {
    plans.updateSync(userId, planId, (sync) => ({
      ...sync,
      prd: { dirty: true, version },
    }));
  }

  function assertNotGenerating(planId: string) {
    if (isActive(latestOf(jobs, planId))) {
      throw new AppError("CONFLICT", prdCopy.errors.generating);
    }
  }

  return {
    runJob,
    runReviseJob,

    /** Keadaan PRD untuk halaman dan polling `GET /api/plan/generate`. */
    getPrd(userId: string, planId: string): PrdState {
      const { plan } = plans.getPlan(userId, planId);
      const latest = repo.latest(plan.id);
      const job = latestOf(jobs, plan.id);
      const status = statusOf(job, latest);
      return {
        status,
        document: latest ? toDocument(latest) : null,
        draft: status === "generating" ? drafts.get(plan.id) : "",
        job: job
          ? {
              id: job.id,
              kind: kindOf(job),
              phase: phaseOf(job),
              sections: job.progress.done,
              error:
                status !== "failed"
                  ? null
                  : job.state === "failed"
                    ? (job.error ?? prdCopy.errors.failed)
                    : job.state === "cancelled"
                      ? prdCopy.errors.cancelled
                      : null,
            }
          : null,
      };
    },

    /**
     * Memulai job PRD. Tidak membuat job baru bila sudah ada yang berjalan, atau bila PRD sudah
     * ada dan tidak diminta membuat ulang. Roadmap harus sudah selesai (diperiksa juga di job).
     */
    startPrd(
      userId: string,
      planId: string,
      { regenerate = false }: { regenerate?: boolean } = {},
    ): { status: PrdStatus } {
      const { plan } = plans.getPlan(userId, planId);
      const latest = latestOf(jobs, plan.id);
      if (isActive(latest)) return { status: "generating" };
      promptInput(userId, plan.id); // menolak lebih awal bila roadmap belum siap
      if (!regenerate && repo.latest(plan.id)) return { status: "ready" };
      jobs.enqueue({ kind: PRD_JOB, planId: plan.id, payload: { userId } });
      return { status: "generating" };
    },

    /**
     * Menyimpan hasil edit pengguna sebagai versi baru. Isi yang sama persis dengan versi terbaru
     * tidak menambah versi (simpan ganda tidak mengotori riwayat). Ditolak selama job berjalan
     * agar suntingan tidak tertimpa versi dari AI.
     */
    saveDocument(userId: string, planId: string, content: string): PrdDocument {
      const { plan } = plans.getPlan(userId, planId);
      assertNotGenerating(plan.id);
      const normalized = `${content.replace(/\r\n/g, "\n").trimEnd()}\n`;
      const latest = repo.latest(plan.id);
      if (latest?.content === normalized) return toDocument(latest);
      const saved = repo.insertNextVersion(plan.id, normalized);
      markChanged(userId, plan.id, saved.version);
      return toDocument(saved);
    },

    /**
     * Memulai revisi PRD terbaru (tool `updatePrd` dan `POST /api/plan/revise`). Tanpa `instructions`,
     * revisi terakhir yang gagal diulang dengan permintaan yang sama.
     * @returns versi saat revisi dimulai; versi hasilnya adalah versi berikutnya sesudah ini.
     * @throws CONFLICT bila PRD belum ada atau job PRD lain sedang berjalan.
     */
    startRevision(
      userId: string,
      planId: string,
      instructions?: string,
    ): { status: PrdStatus; fromVersion: number; jobId: string } {
      const { plan } = plans.getPlan(userId, planId);
      assertNotGenerating(plan.id);
      const latest = repo.latest(plan.id);
      if (!latest) throw new AppError("CONFLICT", prdCopy.errors.noDocument);
      let request = instructions?.trim();
      if (!request) {
        const last = jobs.latestFor(plan.id, PRD_REVISE_JOB);
        const payload = last ? revisePayloadSchema.safeParse(last.payload) : undefined;
        if (!payload?.success) throw new AppError("CONFLICT", prdCopy.errors.noRevision);
        request = payload.data.instructions;
      }
      promptInput(userId, plan.id); // menolak lebih awal bila roadmap belum siap
      const job = jobs.enqueue({
        kind: PRD_REVISE_JOB,
        planId: plan.id,
        payload: { userId, instructions: request },
      });
      return { status: "generating", fromVersion: latest.version, jobId: job.id };
    },

    /** PRD (terbaru, atau versi tertentu) sebagai berkas `<slug>-PRD.md` (R11). */
    exportMarkdown(
      userId: string,
      planId: string,
      version?: number,
    ): { filename: string; content: string } {
      const { plan } = plans.getPlan(userId, planId);
      const latest = repo.latest(plan.id);
      if (!latest) throw new AppError("NOT_FOUND", prdCopy.errors.noDocument);
      const row = version === undefined ? latest : repo.findVersion(plan.id, version);
      if (!row) throw new AppError("NOT_FOUND", prdCopy.errors.versionNotFound);
      // Versi lama diberi akhiran agar tidak tertukar dengan versi terbaru saat diunduh berdampingan.
      const suffix = row.version === latest.version ? "" : `-v${row.version}`;
      return {
        filename: `${slugify(planTitle(plan))}-PRD${suffix}.md`,
        content: row.content,
      };
    },

    /** Riwayat versi, terbaru dulu, tanpa isi. */
    listVersions(userId: string, planId: string): PrdVersion[] {
      const { plan } = plans.getPlan(userId, planId);
      return repo.list(plan.id).map((row) => ({
        id: row.id,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    getVersion(userId: string, planId: string, version: number): PrdDocument {
      const { plan } = plans.getPlan(userId, planId);
      const row = repo.findVersion(plan.id, version);
      if (!row) throw new AppError("NOT_FOUND", prdCopy.errors.versionNotFound);
      return toDocument(row);
    },

    /** Memulihkan versi lama dengan menyalinnya menjadi versi terbaru; riwayat tidak dihapus. */
    restoreVersion(userId: string, planId: string, version: number): PrdDocument {
      const old = this.getVersion(userId, planId, version);
      return this.saveDocument(userId, planId, old.content);
    },
  };
}

export type PrdService = ReturnType<typeof createPrdService>;
