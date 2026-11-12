/** Kode galat yang boleh dilihat klien. Menambah kode berarti memperbarui UI dan docs/api.md. */
export const ERROR_CODES = [
  "NOT_FOUND",
  "VALIDATION",
  "UNAUTHORIZED",
  "BUDGET_EXCEEDED",
  "UPSTREAM_AI",
  "CONFLICT",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ValidationIssue = { path: string; message: string };

/** Bentuk JSON semua respons galat API (dipakai server untuk menulis dan klien untuk membaca). */
export type ApiErrorBody = {
  error: string;
  code: ErrorCode | "INTERNAL";
  issues?: ValidationIssue[];
};
