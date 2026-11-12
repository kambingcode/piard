/**
 * Batas awal proyek eksisting (ADR 0016). Angka analisis akan dikoreksi setelah eval M7-11. Batas
 * upload ada di env (`CODEBASE_MAX_UPLOAD_MB`, bawaan 50) karena bisa diubah pemilik.
 */

const MB = 1024 * 1024;

/** Total byte yang benar-benar terurai dari arsip (bukan ukuran yang diklaim arsip): menutup bom ZIP. */
export const MAX_EXTRACTED_BYTES = 200 * MB;
/** Entri arsip yang diperiksa, termasuk yang diabaikan. */
export const MAX_ARCHIVE_ENTRIES = 20_000;
/** Berkas teks yang dipertahankan; sisanya dicatat sebagai `too_many`. */
export const MAX_TEXT_FILES = 5_000;
export const MAX_FILE_BYTES = 1 * MB;
export const MAX_PATH_LENGTH = 500;
export const MAX_PATH_DEPTH = 30;

/**
 * Satuan anggaran pemaket: "token" = karakter / 4. Ini **bukan** token tokenizer: anggaran sengaja
 * dinyatakan dalam karakter (±1,6 MB teks) agar cakupan berkas tidak bergantung model.
 */
export const CHARS_PER_TOKEN = 4;
/**
 * Karakter per token tokenizer Haiku 5.5 yang terukur pada eval M7-11 (2,03-2,25 untuk kode dan prompt
 * berbahasa Indonesia). Dipakai perkiraan biaya (M7-12), bukan anggaran pemaket.
 */
export const ESTIMATE_CHARS_PER_TOKEN = 2.1;
export const ANALYSIS_TOTAL_TOKENS = 400_000;
export const ANALYSIS_CHUNK_TOKENS = 24_000;
/** Satu berkas dipotong sampai batas ini agar satu berkas besar tidak menghabiskan satu potongan. */
export const ANALYSIS_FILE_TOKENS = 6_000;

/** Umur maksimal sumber sementara di disk sebelum disapu. */
export const SOURCE_TTL_MS = 24 * 60 * 60 * 1000;

/** Token agen (ADR 0016): masa berlaku, batas badan kiriman, dan batas laju per token. */
export const AGENT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const AGENT_SUBMIT_MAX_BYTES = 1 * MB;
export const AGENT_RATE_WINDOW_MS = 10 * 60 * 1000;
/** Cukup untuk beberapa kali kirim ulang setelah galat validasi; lebih dari ini bukan agen yang wajar. */
export const AGENT_RATE_MAX = 20;

/**
 * Konteks codebase untuk pipeline plan (M7-19): batas karakter per halaman yang ikut ke prompt
 * (± 11 ribu token Haiku total). Halaman lain tidak ikut: cukup untuk menyebut modul dan data nyata.
 */
export const CONTEXT_PAGE_CHARS = {
  ringkasan: 3_000,
  teknologi: 3_000,
  modul: 10_000,
  data: 8_000,
} as const;
