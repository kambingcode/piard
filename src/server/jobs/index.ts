import "server-only";

import { getBudget } from "@/server/ai";
import { getDb } from "@/server/db/client";
import { getLogger } from "@/server/logger";
import { createJobRepo } from "./repo";
import { createJobRunner } from "./runner";
import type { JobHandler, JobRunner } from "./types";

export { createJobRepo } from "./repo";
export { createJobRunner, MAX_JOB_ATTEMPTS } from "./runner";
export type {
  EnqueueInput,
  JobEvent,
  JobFilter,
  JobHandler,
  JobHandlerContext,
  JobRecord,
  JobRunner,
  JobState,
} from "./types";

// Disimpan di globalThis agar hot reload `next dev` tidak melahirkan runner kedua yang
// ikut mengambil job dari antrean yang sama.
const globalForJobs = globalThis as typeof globalThis & { __piardJobs?: JobRunner };

/** Runner job proses ini (dibuat saat pertama dipakai). */
export function getJobRunner(): JobRunner {
  globalForJobs.__piardJobs ??= createJobRunner({
    repo: createJobRepo(getDb()),
    logger: getLogger("jobs"),
    admit: () => getBudget().assertAvailable(),
  });
  return globalForJobs.__piardJobs;
}

/**
 * Mendaftarkan handler lalu memulihkan job yang tertinggal. Dipanggil sekali saat boot server
 * dari `instrumentation.ts`, yang merupakan satu-satunya tempat yang boleh mengenal semua fitur.
 */
export function startJobRunner(handlers: Record<string, JobHandler>): JobRunner {
  const runner = getJobRunner();
  for (const [kind, handler] of Object.entries(handlers)) {
    try {
      runner.register(kind, handler);
    } catch {
      // Hot reload memanggil boot lagi pada runner yang sama; pendaftaran ulang tidak berbahaya.
    }
  }
  runner.recover();
  return runner;
}
