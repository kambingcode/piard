/** Batas awal jembatan agen (ADR 0017; alasan per angka ada di tabel ADR). */

const KB = 1024;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const MAX_ACTIVE_TOKENS = 5;
export const TOKEN_TTL_DAYS = [7, 30, 90] as const;
export const DEFAULT_TOKEN_TTL_DAYS = 30;
export const TOKEN_LABEL_MAX = 60;
export const tokenTtlMs = (days: number) => days * DAY;

export const RATE_WINDOW_MS = 10 * MINUTE;
export const RATE_MAX = 600;

export const AGENT_BODY_MAX_BYTES = 64 * KB;
export const NOTE_MAX = 4_000;
export const VERIFICATION_MAX = 2_000;
export const FILES_CHANGED_MAX = 100;
export const FILE_PATH_MAX = 300;
export const NOTES_PER_TASK_MAX = 200;

export const PRD_OUT_MAX = 60_000;
export const SPEC_OUT_MAX = 20_000;
export const PRD_EXCERPT_MAX = 8_000;
export const INSTRUCTIONS_MAX = 8_000;

/** Card `doing` milik agen tanpa kabar selama ini ditandai "mungkin macet". */
export const STALE_AFTER_MS = 2 * 60 * MINUTE;
