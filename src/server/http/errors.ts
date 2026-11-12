import "server-only";

import {
  type ApiErrorBody,
  ERROR_CODES,
  type ErrorCode,
  type ValidationIssue,
} from "@/lib/api-error";

export { ERROR_CODES };
export type { ApiErrorBody, ErrorCode, ValidationIssue };

/** Status HTTP bawaan per kode galat (juga dicantumkan di docs/api.md). */
export const DEFAULT_STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  BUDGET_EXCEEDED: 429,
  UPSTREAM_AI: 502,
  CONFLICT: 409,
};

export const INTERNAL_ERROR_MESSAGE =
  "Terjadi kesalahan di server. Coba lagi sebentar lagi.";

/**
 * Penanda kelas yang berlaku lintas salinan modul. Next memuat `instrumentation.ts` dan route handler
 * dalam graf modul terpisah, sehingga ada dua kelas `AppError`; job runner (singleton di `globalThis`,
 * dibuat dari graf instrumentation) melempar salinan yang `instanceof` biasa di route tidak kenali,
 * dan galat yang diharapkan (mis. `BUDGET_EXCEEDED` dari `admit`) menjadi 500 generik.
 * `Symbol.for` sama di seluruh proses, jadi `instanceof` di bawah memeriksa penanda, bukan identitas kelas.
 */
const APP_ERROR = Symbol.for("piard.AppError");
const VALIDATION_ERROR = Symbol.for("piard.ValidationError");

const branded = (value: unknown, brand: symbol) =>
  typeof value === "object" && value !== null && brand in value;

/**
 * Galat yang sudah diperkirakan dan aman ditampilkan ke pengguna.
 * `message` dibaca manusia (Bahasa Indonesia, menyebut langkah berikutnya bila ada).
 */
export class AppError extends Error {
  readonly [APP_ERROR] = true;

  static override [Symbol.hasInstance](value: unknown): value is AppError {
    return branded(value, APP_ERROR);
  }

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number = DEFAULT_STATUS[code],
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "AppError";
  }
}

/** Masukan dari klien tidak lolos skema; membawa daftar masalah per kolom. */
export class ValidationError extends AppError {
  readonly [VALIDATION_ERROR] = true;

  static override [Symbol.hasInstance](value: unknown): value is ValidationError {
    return branded(value, VALIDATION_ERROR);
  }

  constructor(
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

/**
 * Mengubah galat apa pun menjadi status + badan respons.
 * Galat tak terduga tidak pernah membocorkan pesan aslinya ke klien.
 */
export function toErrorResponse(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof ValidationError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code, issues: error.issues },
    };
  }
  if (error instanceof AppError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  return { status: 500, body: { error: INTERNAL_ERROR_MESSAGE, code: "INTERNAL" } };
}
