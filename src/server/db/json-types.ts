/**
 * Bentuk kolom JSON di database. Hanya tipe: validasi Zod ada di `schemas.ts` tiap fitur,
 * dan bentuk ini mengikuti contoh respons di analysis/api-samples/.
 */

export type QuestionType = "text" | "single_choice" | "multi_choice";

export type ClarifyingQuestion = {
  id: string;
  question: string;
  type: QuestionType;
  options: string[];
  required: boolean;
};

export type AnswerValue = string | string[];

export type QuestionAnswers = {
  questions: ClarifyingQuestion[];
  answers: Record<string, AnswerValue>;
};

/** Pilihan teknologi per bidang; nilai `"ai-pilih"` berarti diserahkan ke AI. */
export type TechStack = Record<string, string>;

/** Status sinkronisasi PRD, fitur, dan task (diisi bertahap oleh fitur roadmap dan revision). */
export type SyncState = Record<string, unknown>;

export type JobProgress = {
  phase: string;
  done: number;
  total: number;
};

/** Muatan masukan job; isinya ditentukan handler tiap jenis job. */
export type JobPayload = Record<string, unknown>;

/** Potongan pesan chat (format AI SDK); diperlakukan buram oleh lapisan database. */
export type MessagePart = Record<string, unknown>;

/** Satu perubahan yang diusulkan AI terhadap fitur atau dokumen. */
export type SyncOperation = Record<string, unknown>;

/**
 * Pengaturan AI yang diubah lewat /settings dan menimpa `.env`. Bagian yang tidak ada berarti nilai
 * `.env` yang dipakai. `null` pada batas biaya berarti tanpa batas.
 */
export type AiSettingsOverrides = {
  models?: Partial<Record<string, string>>;
  budget?: { dailyUsd: number | null; monthlyUsd: number | null };
};

/** Teknologi yang terdeteksi dari manifes repo (fitur codebase). Bidang yang tidak ada = tidak terdeteksi. */
export type DetectedStack = {
  languages: string[];
  frontend?: string;
  backend?: string;
  database?: string;
  deployment?: string;
  tools: string[];
};

/** Satu berkas teks yang dipertahankan pemindai; `key` = jenis berkas kunci (mis. `readme`, `manifest`). */
export type ManifestFile = {
  path: string;
  size: number;
  language: string | null;
  key: string | null;
};

/**
 * Ringkasan sumber yang diterima (fitur codebase). Disimpan permanen; isi berkas tidak ikut disimpan
 * (ADR 0016). `skipped` = jumlah berkas yang dilewati per alasan.
 */
export type CodebaseManifest = {
  files: ManifestFile[];
  totalFiles: number;
  totalBytes: number;
  skipped: Record<string, number>;
  redactions: number;
  redactedFiles: number;
  languages: Record<string, number>;
};

/**
 * Hasil penulisan dokumentasi terakhir (analisis server atau kiriman agen, M7-16): slug per hasil.
 * `proposed` = halaman yang versi terbarunya edit manual, hasil barunya menjadi usulan.
 */
export type AnalysisSummary = {
  at: string;
  origin: "agent" | "ai";
  added: string[];
  changed: string[];
  unchanged: string[];
  proposed: string[];
  /** Analisis server saja (M7-14): berkas dipotong / tidak ikut anggaran. Baris lama tanpa field ini. */
  truncatedFiles?: number;
  droppedFiles?: number;
};
