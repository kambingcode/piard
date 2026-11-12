import "server-only";

import { z } from "zod";
import { type AiClient, type BudgetStatus, estimateCostUsd } from "@/server/ai";
import { AppError } from "@/server/http/errors";
import type { JobEvent, JobHandlerContext, JobRunner } from "@/server/jobs";
import { mockPage, mockProfile, mockSummary } from "../ai/analyze.mock";
import {
  type AnalysisTokens,
  estimateAnalysisTokens,
  planAnalysis,
} from "../ai/analyze.plan";
import {
  buildPagePrompt,
  buildProfilePrompt,
  buildSummaryPrompt,
} from "../ai/analyze.prompt";
import {
  type ProfileOutput,
  pageOutputSchema,
  profileOutputSchema,
  summaryOutputSchema,
} from "../ai/analyze.schema";
import { codebaseCopy } from "../copy";
import {
  ANALYSIS_PHASES,
  type AnalysisEstimate,
  type AnalysisStatus,
  DOC_PAGES,
  docTitle,
} from "../schemas";

export {
  ANALYSIS_PHASES,
  type AnalysisEstimate,
  type AnalysisPhase,
  type AnalysisStatus,
  type ConfirmReason,
} from "../schemas";

import { summarizeOutcomes, writeGeneratedPage } from "./docs-writer";
import type { CodebaseRepo, CodebaseRow } from "./repo";
import type { AnalysisWork, SourceStore } from "./source-store";

export const ANALYZE_JOB = "codebase-analyze";
/** Panggilan model paralel per langkah, sama dengan job `build`. */
export const ANALYZE_CONCURRENCY = 3;
/** Ambang konfirmasi biaya (B-05): di atas US$0,50, atau di atas 20% sisa anggaran bulanan. */
export const CONFIRM_ABOVE_USD = 0.5;
export const CONFIRM_BUDGET_SHARE = 0.2;

const payloadSchema = z.object({
  userId: z.string().min(1),
  codebaseId: z.string().min(1),
});

export type StartResult =
  | { started: true; codebase: CodebaseRow }
  | { started: false; estimate: AnalysisEstimate };

type Deps = {
  repo: CodebaseRepo;
  store: SourceStore;
  ai: AiClient;
  jobs: Pick<JobRunner, "enqueue" | "get" | "cancel" | "retry" | "subscribe">;
  /** Model tugas `codebase` yang berlaku (`/settings` atau `MODEL_CODEBASE`). */
  model: () => string;
  budget: () => BudgetStatus;
  own: (userId: string, id: string) => CodebaseRow;
  concurrency?: number;
  now?: () => Date;
};

const usd = (value: number) => value.toFixed(2).replace(".", ",");

/** Judul `#`/`##` di baris pertama yang sama dengan judul halaman dibuang (penampil menulis judulnya). */
function cleanPage(content: string, title: string): string {
  let text = content.trim();
  const fenced = /^(`{3,})(?:markdown|md)?\n([\s\S]*)\n\1$/.exec(text);
  if (fenced?.[2]) text = fenced[2].trim();
  const heading = /^#{1,2}\s+(.+)\n+/.exec(text);
  if (heading?.[1] && heading[1].trim().toLowerCase() === title.toLowerCase()) {
    text = text.slice(heading[0].length).trim();
  }
  return text;
}

/**
 * Menjalankan `work` per item dengan paling banyak `limit` sekaligus; berhenti mengambil item baru bila
 * dibatalkan atau ada galat. Galat pertama dilempar setelah pekerja yang sedang jalan selesai, sehingga
 * hasil yang sudah selesai sempat disimpan (lanjut lewat "Coba lagi").
 */
async function pool<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (next < items.length && !signal.aborted && failure === undefined) {
      const item = items[next++] as T;
      try {
        await work(item);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure !== undefined) throw failure;
}

/**
 * Analisis server proyek eksisting (M7-10, M7-12): perkiraan biaya, mulai/coba lagi/batalkan, status, dan
 * handler job `codebase-analyze` (profil → ringkasan per potongan → halaman). Hasil antara disimpan di
 * berkas kerja di samping sumber sehingga job lanjut dari langkah terakhir setelah restart.
 */
export function createAnalysisService(deps: Deps) {
  const { repo, store, ai, jobs } = deps;
  const now = deps.now ?? (() => new Date());
  const concurrency = deps.concurrency ?? ANALYZE_CONCURRENCY;

  function sourceOf(row: CodebaseRow) {
    const at = now().getTime();
    const files = store.load(row.id, at);
    const savedAt = store.savedAt(row.id, at);
    if (!files || savedAt === null) {
      throw new AppError("VALIDATION", codebaseCopy.analysis.sourceExpired);
    }
    return { files, savedAt };
  }

  function confirmReasons(
    model: string,
    costUsd: number | null,
  ): AnalysisEstimate["reasons"] {
    const copy = codebaseCopy.analysis.confirm;
    if (costUsd === null)
      return [{ kind: "unknown_price", message: copy.unknownPrice(model) }];
    const reasons: AnalysisEstimate["reasons"] = [];
    if (costUsd > CONFIRM_ABOVE_USD)
      reasons.push({ kind: "cost", message: copy.cost(usd(costUsd)) });
    const { monthly } = deps.budget();
    if (monthly.limitUsd !== null) {
      const remaining = Math.max(0, monthly.limitUsd - monthly.spentUsd);
      if (costUsd > CONFIRM_BUDGET_SHARE * remaining) {
        reasons.push({
          kind: "budget",
          message: copy.budget(usd(costUsd), usd(remaining)),
        });
      }
    }
    return reasons;
  }

  function estimateFor(row: CodebaseRow): AnalysisEstimate {
    const { files } = sourceOf(row);
    const plan = planAnalysis(files);
    const tokens: AnalysisTokens = estimateAnalysisTokens(plan, {
      name: row.name,
      language: row.language,
      stack: row.detectedStack,
    });
    const model = deps.model();
    const costUsd = estimateCostUsd(model, tokens.perCall);
    const reasons = confirmReasons(model, costUsd);
    return {
      model,
      calls: tokens.calls,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      costUsd,
      files: files.length,
      chunks: plan.chunks.length,
      truncatedFiles: plan.truncated.length,
      droppedFiles: plan.dropped.length,
      needsConfirmation: reasons.length > 0,
      reasons,
    };
  }

  /**
   * Menyamakan status codebase dengan job-nya: job yang berhenti tanpa sempat memperbarui codebase
   * (mis. melewati batas percobaan setelah restart) membuat codebase `failed`, bukan "menganalisis" selamanya.
   */
  function reconcile(row: CodebaseRow): CodebaseRow {
    if (row.status !== "analyzing") return row;
    const job = row.analysisJobId ? jobs.get(row.analysisJobId) : undefined;
    if (job && (job.state === "queued" || job.state === "running")) return row;
    const error =
      job?.state === "failed"
        ? (job.error ?? codebaseCopy.analysis.failed)
        : codebaseCopy.analysis.interrupted;
    repo.update(row.userId, row.id, { status: "failed", error });
    return repo.findById(row.id) ?? row;
  }

  function statusOf(userId: string, id: string): AnalysisStatus {
    const row = reconcile(deps.own(userId, id));
    const job = row.analysisJobId ? jobs.get(row.analysisJobId) : undefined;
    return {
      status: row.status,
      error: row.error,
      job: job
        ? {
            id: job.id,
            state: job.state,
            phase:
              job.state === "queued"
                ? "queued"
                : (ANALYSIS_PHASES.find((p) => p === job.progress.phase) ?? "profile"),
            done: job.progress.done,
            total: job.progress.total,
          }
        : null,
    };
  }

  async function run(ctx: JobHandlerContext): Promise<void> {
    const { job, signal, progress } = ctx;
    const { userId, codebaseId } = payloadSchema.parse(job.payload);
    const found = repo.findById(codebaseId);
    // Codebase dihapus (atau bukan milik pengirim job): tidak ada yang dikerjakan.
    if (!found || found.userId !== userId) return;
    const row = found;

    try {
      const { files, savedAt } = sourceOf(row);
      const plan = planAnalysis(files);
      const fresh: AnalysisWork = {
        sourceSavedAt: savedAt,
        profile: null,
        summaries: plan.chunks.map(() => null),
        pages: [],
        outcomes: {},
      };
      const loaded = store.loadWork(row.id, savedAt);
      const work =
        loaded && loaded.summaries.length === plan.chunks.length ? loaded : fresh;
      // Tulisan setelah dibatalkan dilewati: pembatalan sudah menghapus sumber dan berkas kerja.
      const persist = () => {
        if (!signal.aborted) store.saveWork(row.id, work);
      };
      const context = { task: "codebase" as const, userId, planId: null, refId: job.id };
      const meta = { name: row.name, language: row.language, stack: row.detectedStack };

      // Langkah 1: profil.
      progress({ phase: "profile", done: 0, total: 1 });
      const parsedProfile = profileOutputSchema.safeParse(work.profile);
      let profile: ProfileOutput;
      if (parsedProfile.success) {
        profile = parsedProfile.data;
      } else {
        const { system, prompt } = buildProfilePrompt({
          ...meta,
          paths: plan.paths,
          keyFiles: plan.keyFiles,
        });
        const { data } = await ai.generateStructured({
          ...context,
          system,
          prompt,
          schema: profileOutputSchema,
          mock: () => mockProfile(row.name, row.language, plan.paths, row.detectedStack),
          abortSignal: signal,
        });
        profile = data;
        work.profile = data;
        persist();
      }
      if (signal.aborted) return;

      // Langkah 2: ringkasan per potongan.
      const todo = plan.chunks.flatMap((chunk, index) =>
        work.summaries[index] === null ? [{ chunk, index }] : [],
      );
      let summarized = plan.chunks.length - todo.length;
      progress({ phase: "summarize", done: summarized, total: plan.chunks.length });
      await pool(todo, concurrency, signal, async ({ chunk, index }) => {
        const { system, prompt } = buildSummaryPrompt({
          ...meta,
          profile,
          chunk,
          index,
          total: plan.chunks.length,
        });
        const { data } = await ai.generateStructured({
          ...context,
          system,
          prompt,
          schema: summaryOutputSchema,
          mock: () => mockSummary(row.language, chunk),
          abortSignal: signal,
        });
        if (signal.aborted) return;
        work.summaries[index] = data.summary;
        persist();
        summarized += 1;
        progress({ done: summarized });
      });
      if (signal.aborted) return;

      // Langkah 3: halaman, masing-masing disimpan begitu selesai.
      const summaries = work.summaries.filter((s): s is string => s !== null);
      const pagesTodo = DOC_PAGES.filter((p) => !work.pages.includes(p.slug));
      let written = DOC_PAGES.length - pagesTodo.length;
      progress({ phase: "pages", done: written, total: DOC_PAGES.length });
      await pool(pagesTodo, concurrency, signal, async (page) => {
        const { system, prompt } = buildPagePrompt({
          ...meta,
          slug: page.slug,
          profile,
          summaries,
          paths: plan.paths,
        });
        const { data } = await ai.generateStructured({
          ...context,
          system,
          prompt,
          schema: pageOutputSchema,
          mock: () =>
            mockPage(
              page.slug,
              row.name,
              row.language,
              profile,
              plan.paths,
              row.detectedStack,
            ),
          abortSignal: signal,
        });
        if (signal.aborted) return;
        const content = cleanPage(data.content, docTitle(page.slug, row.language));
        if (content !== "") {
          work.outcomes[page.slug] = writeGeneratedPage(
            repo,
            row,
            page.slug,
            content,
            "ai",
          );
        }
        work.pages.push(page.slug);
        persist();
        written += 1;
        progress({ done: written });
      });
      if (signal.aborted) return;

      const at = now();
      repo.update(row.userId, row.id, {
        status: "ready",
        error: null,
        analyzedAt: at,
        analysisSummary: {
          ...summarizeOutcomes(work.outcomes, "ai", at),
          truncatedFiles: plan.truncated.length,
          droppedFiles: plan.dropped.length,
        },
      });
      store.remove(row.id);
      progress({ phase: "done", done: DOC_PAGES.length, total: DOC_PAGES.length });
    } catch (error) {
      if (signal.aborted) return;
      // Sumber dan hasil antara tetap disimpan (sampai TTL) agar "Coba lagi" bisa melanjutkan.
      const message =
        error instanceof AppError ? error.message : codebaseCopy.analysis.failed;
      repo.update(row.userId, row.id, { status: "failed", error: message });
      throw error instanceof AppError
        ? error
        : new AppError("UPSTREAM_AI", codebaseCopy.analysis.failed, undefined, error);
    }
  }

  return {
    /** Perkiraan token dan biaya dari sumber yang tersimpan, sebelum job dimulai (M7-12). */
    estimate(userId: string, id: string): AnalysisEstimate {
      return estimateFor(deps.own(userId, id));
    },

    /** Untuk halaman: perkiraan, atau pesan pengguna bila sumber tidak tersedia (tanpa melempar). */
    tryEstimate(
      userId: string,
      id: string,
    ): { estimate: AnalysisEstimate; error: null } | { estimate: null; error: string } {
      try {
        return { estimate: estimateFor(deps.own(userId, id)), error: null };
      } catch (error) {
        if (error instanceof AppError) return { estimate: null, error: error.message };
        throw error;
      }
    },

    /**
     * Memulai analisis. Bila perkiraan melewati ambang dan `confirmed` tidak true, job **tidak** dimulai
     * dan perkiraannya dikembalikan untuk ditampilkan.
     *
     * @throws {AppError} `CONFLICT` saat analisis berjalan, `VALIDATION` bila sumber tidak ada,
     *   `BUDGET_EXCEEDED` bila batas biaya tercapai.
     */
    start(userId: string, id: string, options: { confirmed: boolean }): StartResult {
      const row = reconcile(deps.own(userId, id));
      if (row.status === "analyzing") {
        throw new AppError("CONFLICT", codebaseCopy.analysis.busy);
      }
      const estimate = estimateFor(row);
      if (estimate.needsConfirmation && !options.confirmed) {
        return { started: false, estimate };
      }
      const job = jobs.enqueue({
        kind: ANALYZE_JOB,
        payload: { userId, codebaseId: id },
      });
      repo.update(userId, id, {
        status: "analyzing",
        error: null,
        analysisJobId: job.id,
      });
      return { started: true, codebase: deps.own(userId, id) };
    },

    /** "Coba lagi" setelah gagal: melanjutkan dari hasil antara yang tersimpan. */
    retry(userId: string, id: string): CodebaseRow {
      const row = reconcile(deps.own(userId, id));
      if (row.status !== "failed" || !row.analysisJobId) {
        throw new AppError("CONFLICT", codebaseCopy.analysis.notRetryable);
      }
      sourceOf(row);
      const job = jobs.retry(row.analysisJobId);
      repo.update(userId, id, {
        status: "analyzing",
        error: null,
        analysisJobId: job.id,
      });
      return deps.own(userId, id);
    },

    /**
     * "Batalkan": menghentikan job dan menghapus sumber sementara serta hasil antara. Status kembali ke
     * `ready` bila sudah ada dokumentasi (halaman yang selesai tetap ada), selain itu `awaiting_source`.
     */
    cancel(userId: string, id: string): CodebaseRow {
      const row = deps.own(userId, id);
      if (row.status !== "analyzing" && row.status !== "failed") {
        throw new AppError("CONFLICT", codebaseCopy.analysis.notRunning);
      }
      if (row.analysisJobId) jobs.cancel(row.analysisJobId);
      store.remove(id);
      const hasDocs = repo.latestDocs(id).length > 0;
      repo.update(userId, id, {
        status: hasDocs ? "ready" : "awaiting_source",
        error: hasDocs ? null : codebaseCopy.analysis.cancelled,
      });
      return deps.own(userId, id);
    },

    status: statusOf,

    /**
     * Status analisis secara langsung (dasar SSE `/stream`): status saat ini dikirim segera, lalu setiap
     * perubahan job analisis codebase ini. Job baru (mulai ulang) ikut terpantau tanpa menyambung ulang.
     *
     * @throws {AppError} `NOT_FOUND` bila bukan milik pengguna (sebelum aliran dibuka).
     */
    subscribe(
      userId: string,
      id: string,
      listener: (status: AnalysisStatus) => void,
    ): () => void {
      const first = statusOf(userId, id);
      listener(first);
      return jobs.subscribe(
        (event: JobEvent) => {
          const row = repo.findById(id);
          if (!row || row.userId !== userId || row.analysisJobId !== event.jobId) return;
          listener(statusOf(userId, id));
        },
        { kind: ANALYZE_JOB },
      );
    },

    run,
  };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
