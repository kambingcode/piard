import "server-only";

import type { JobPayload, JobProgress } from "@/server/db/json-types";
import type { JOB_STATES } from "@/server/db/schema";
import type { Logger } from "@/server/logger";

export type JobState = (typeof JOB_STATES)[number];

/** Pekerjaan latar belakang sebagaimana tersimpan di database. */
export type JobRecord = {
  id: string;
  kind: string;
  planId: string | null;
  state: JobState;
  payload: JobPayload;
  progress: JobProgress;
  error: string | null;
  /** Berapa kali job mulai dijalankan; naik juga saat dipulihkan setelah proses mati. */
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Yang diterima handler saat job berjalan. */
export type JobHandlerContext = {
  /** Keadaan job saat mulai, termasuk `progress` terakhir sehingga handler bisa melanjutkan. */
  job: JobRecord;
  /** Terbatalkan saat `cancel()` dipanggil; handler harus berhenti secepatnya. */
  signal: AbortSignal;
  /** Menyimpan dan menyiarkan kemajuan; field yang tidak diberikan dipertahankan. */
  progress(update: Partial<JobProgress>): void;
  logger: Logger;
};

/**
 * Handler satu jenis job. Harus **idempoten**: dapat dijalankan ulang dari awal atau dilanjutkan
 * dari `ctx.job.progress` setelah proses mati. Simpan hasil tiap langkah segera, jangan di akhir.
 * Melempar galat menandai job `failed`; `AppError` tampil apa adanya ke pengguna.
 */
export type JobHandler = (ctx: JobHandlerContext) => Promise<void>;

/** Siaran perubahan job (dasar event SSE `job`). */
export type JobEvent = {
  jobId: string;
  kind: string;
  planId: string | null;
  state: JobState;
  progress: JobProgress;
  error: string | null;
};

export type JobFilter = { jobId?: string; planId?: string; kind?: string };

export type EnqueueInput = {
  kind: string;
  planId?: string | null;
  payload?: JobPayload;
  /**
   * Bila true (bawaan) dan sudah ada job `queued`/`running` dengan jenis, plan, dan muatan sama,
   * job itu dikembalikan dan tidak dibuat yang baru (klik ganda tidak menggandakan biaya AI).
   */
  dedupe?: boolean;
};

export type JobRunner = {
  /** Mendaftarkan handler untuk satu jenis job. @throws bila jenisnya sudah terdaftar. */
  register(kind: string, handler: JobHandler): void;
  /**
   * @throws bila tidak ada handler untuk `kind`; `AppError` dari `admit` (mis. `BUDGET_EXCEEDED`)
   * bila job baru ditolak. Job aktif yang sama dikembalikan tanpa pemeriksaan itu.
   */
  enqueue(input: EnqueueInput): JobRecord;
  get(id: string): JobRecord | undefined;
  /** Job terbaru untuk plan (opsional per jenis); dasar polling status. */
  latestFor(planId: string, kind?: string): JobRecord | undefined;
  /** Membatalkan job antre seketika, atau mengirim sinyal ke job yang sedang berjalan. */
  cancel(id: string): JobRecord | undefined;
  /**
   * Membatalkan semua job aktif plan (tombol "Batalkan" di progres). Pemanggil wajib sudah memastikan
   * plan milik pengguna. @returns jumlah job yang dibatalkan atau diberi sinyal berhenti.
   */
  cancelForPlan(planId: string): number;
  /** Mengantrekan ulang job `failed`/`cancelled` (tombol "Coba lagi"); diperiksa `admit` seperti job baru. */
  retry(id: string): JobRecord;
  subscribe(listener: (event: JobEvent) => void, filter?: JobFilter): () => void;
  /**
   * Memulihkan job yang tertinggal `running` karena proses mati. Dipanggil sekali saat boot.
   * @returns jumlah job yang diantrekan ulang.
   */
  recover(): number;
  /** Terpenuhi saat tidak ada job yang berjalan maupun antre. Berguna untuk tes dan shutdown. */
  idle(): Promise<void>;
};
