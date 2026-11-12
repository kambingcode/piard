import "server-only";

import type { JobProgress } from "@/server/db/json-types";
import { AppError, INTERNAL_ERROR_MESSAGE } from "@/server/http/errors";
import type { Logger } from "@/server/logger";
import type { JobRepo } from "./repo";
import type {
  EnqueueInput,
  JobEvent,
  JobFilter,
  JobHandler,
  JobRecord,
  JobRunner,
} from "./types";

/** Job yang berulang kali ditemukan `running` saat boot dianggap membuat proses mati. */
export const MAX_JOB_ATTEMPTS = 3;

const CRASH_LOOP_MESSAGE =
  "Proses terhenti berulang kali saat menjalankan pekerjaan ini. Coba lagi, atau periksa log server.";
const NO_HANDLER_MESSAGE =
  "Pekerjaan ini tidak dikenali oleh versi aplikasi yang berjalan.";

type Subscriber = { listener: (event: JobEvent) => void; filter: JobFilter };

type RunnerDeps = {
  repo: JobRepo;
  logger: Logger;
  /**
   * Dipanggil sebelum job baru diantrekan atau diulang; galat yang dilempar (mis. `BUDGET_EXCEEDED`)
   * menolak job itu sehingga pengguna langsung tahu, bukan setelah job gagal di antrean.
   */
  admit?: () => void;
};

/** JSON dengan kunci terurut, agar muatan yang sama selalu menghasilkan teks yang sama. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function toEvent(job: JobRecord): JobEvent {
  return {
    jobId: job.id,
    kind: job.kind,
    planId: job.planId,
    state: job.state,
    progress: job.progress,
    error: job.error,
  };
}

function matches(filter: JobFilter, job: JobRecord): boolean {
  return (
    (filter.jobId === undefined || filter.jobId === job.id) &&
    (filter.planId === undefined || filter.planId === job.planId) &&
    (filter.kind === undefined || filter.kind === job.kind)
  );
}

function userFacingError(error: unknown): string {
  return error instanceof AppError ? error.message : INTERNAL_ERROR_MESSAGE;
}

/**
 * Runner job dalam proses: satu worker, antrean FIFO yang disimpan di tabel `jobs`.
 *
 * Alasan desain: aplikasi pribadi satu proses Node, jadi cukup SQLite sebagai antrean tahan
 * restart tanpa Redis/worker terpisah (docs/adr/0004-job-in-process.md).
 */
export function createJobRunner({
  repo,
  logger,
  admit = () => undefined,
}: RunnerDeps): JobRunner {
  const handlers = new Map<string, JobHandler>();
  const subscribers = new Set<Subscriber>();
  const running = new Map<string, AbortController>();
  let draining: Promise<void> | undefined;

  function emit(job: JobRecord | undefined): JobRecord | undefined {
    if (!job) return job;
    const event = toEvent(job);
    for (const { listener, filter } of subscribers) {
      if (!matches(filter, job)) continue;
      try {
        listener(event);
      } catch (error) {
        logger.warn("pendengar job gagal", { jobId: job.id, error });
      }
    }
    return job;
  }

  function kick() {
    draining ??= drain().finally(() => {
      draining = undefined;
    });
  }

  async function drain(): Promise<void> {
    try {
      for (let job = repo.claimNext(); job; job = repo.claimNext()) {
        await execute(job);
      }
    } catch (error) {
      // Galat di sini berarti database bermasalah; job yang tertinggal dipulihkan saat boot berikutnya.
      logger.error("antrean job berhenti", { error });
    }
  }

  async function execute(claimed: JobRecord): Promise<void> {
    const log = logger.child(claimed.kind);
    const handler = handlers.get(claimed.kind);
    emit(claimed);
    if (!handler) {
      log.error("handler tidak terdaftar", { jobId: claimed.id });
      emit(repo.setState(claimed.id, "failed", NO_HANDLER_MESSAGE));
      return;
    }

    const abort = new AbortController();
    running.set(claimed.id, abort);
    let current = claimed;

    try {
      await handler({
        job: claimed,
        signal: abort.signal,
        logger: log,
        progress: (update) => {
          const next: JobProgress = { ...current.progress, ...update };
          const saved = repo.updateProgress(claimed.id, next);
          if (saved) current = saved;
          emit(saved);
        },
      });
      finish(claimed.id, abort.signal.aborted ? "cancelled" : "succeeded");
      log.info("job selesai", { jobId: claimed.id, aborted: abort.signal.aborted });
    } catch (error) {
      if (abort.signal.aborted) {
        finish(claimed.id, "cancelled");
        return;
      }
      log.error("job gagal", { jobId: claimed.id, error });
      emit(repo.setState(claimed.id, "failed", userFacingError(error)));
    } finally {
      running.delete(claimed.id);
    }
  }

  function finish(id: string, state: "succeeded" | "cancelled") {
    emit(repo.setState(id, state));
  }

  const runner: JobRunner = {
    register(kind, handler) {
      if (handlers.has(kind)) throw new Error(`Handler job "${kind}" sudah terdaftar`);
      handlers.set(kind, handler);
    },

    enqueue({ kind, planId = null, payload = {}, dedupe = true }: EnqueueInput) {
      if (!handlers.has(kind)) throw new Error(`Tidak ada handler untuk job "${kind}"`);
      if (dedupe) {
        const wanted = stableStringify(payload);
        const existing = repo
          .findActive(kind, planId)
          .find((job) => stableStringify(job.payload) === wanted);
        if (existing) return existing;
      }
      admit();
      const job = repo.insert({ kind, planId, payload });
      emit(job);
      queueMicrotask(kick);
      return job;
    },

    get: (id) => repo.get(id),

    latestFor: (planId, kind) => repo.latestFor(planId, kind),

    cancel(id) {
      const queued = repo.transition(id, ["queued"], "cancelled");
      if (queued) return emit(queued);
      running.get(id)?.abort();
      return repo.get(id);
    },

    cancelForPlan(planId) {
      const active = repo.listActiveForPlan(planId);
      for (const job of active) runner.cancel(job.id);
      return active.length;
    },

    retry(id) {
      const failed = repo.get(id);
      if (failed && (failed.state === "failed" || failed.state === "cancelled")) admit();
      const job = repo.transition(id, ["failed", "cancelled"], "queued");
      if (!job) {
        throw new AppError(
          "CONFLICT",
          "Pekerjaan ini masih berjalan atau sudah selesai, jadi tidak perlu diulang.",
        );
      }
      emit(job);
      queueMicrotask(kick);
      return job;
    },

    subscribe(listener, filter = {}) {
      const subscriber = { listener, filter };
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },

    recover() {
      let requeued = 0;
      for (const job of repo.listByState("running")) {
        if (running.has(job.id)) continue; // masih berjalan di proses ini
        if (job.attempts >= MAX_JOB_ATTEMPTS) {
          logger.error("job dihentikan: terlalu sering mati", {
            jobId: job.id,
            kind: job.kind,
          });
          emit(repo.setState(job.id, "failed", CRASH_LOOP_MESSAGE));
          continue;
        }
        emit(repo.transition(job.id, ["running"], "queued"));
        requeued += 1;
      }
      if (requeued > 0) {
        logger.info("job dipulihkan setelah restart", { count: requeued });
        queueMicrotask(kick);
      }
      return requeued;
    },

    async idle() {
      await Promise.resolve(); // beri kesempatan pada kick() yang dijadwalkan enqueue/retry
      while (draining) await draining;
    },
  };
  return runner;
}
