import type { ApiErrorBody } from "./api-error";
import { readNdjson } from "./ndjson";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiErrorBody };

export const NETWORK_ERROR: ApiErrorBody = {
  error: "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.",
  code: "INTERNAL",
};

const NO_CONTENT = 204;
const UNAUTHORIZED = 401;
export const SIGN_IN_PATH = "/sign-in";

/**
 * Sesi habis di tengah pemakaian (mis. polling roadmap): pindah ke halaman masuk. Endpoint auth
 * dikecualikan karena 401 di sana berarti kata sandi salah, yang ditampilkan di formulir.
 */
function redirectOnExpiredSession(url: string, status: number): void {
  if (status !== UNAUTHORIZED || url.startsWith("/api/auth/")) return;
  if (typeof window === "undefined") return;
  window.location.assign(SIGN_IN_PATH);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    "code" in value
  );
}

/**
 * Memanggil API Piard dan mengembalikan hasil bertipe, tanpa melempar.
 * Galat jaringan dan respons non-JSON dipetakan ke {@link ApiErrorBody} yang bisa ditampilkan.
 */
export async function apiRequest<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  if (response.status === NO_CONTENT)
    return { ok: true, status: response.status, data: undefined as T };

  redirectOnExpiredSession(url, response.status);
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return { ok: true, status: response.status, data: body as T };
  return {
    ok: false,
    status: response.status,
    error: isApiErrorBody(body)
      ? body
      : { ...NETWORK_ERROR, error: "Respons server tidak dikenali." },
  };
}

export function postJson<T = unknown>(
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  return apiRequest<T>(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * `POST` yang menjawab dengan aliran NDJSON (chat revisi). Galat sebelum aliran dimulai (validasi,
 * sesi habis, konflik) kembali sebagai {@link ApiErrorBody} biasa; sesudahnya, event dibaca berurutan.
 */
export async function postStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<
  | { ok: true; events: AsyncGenerator<unknown> }
  | { ok: false; status: number; error: ApiErrorBody }
> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  redirectOnExpiredSession(url, response.status);
  if (response.ok && response.body)
    return { ok: true, events: readNdjson(response.body) };
  const parsed: unknown = await response.json().catch(() => undefined);
  return {
    ok: false,
    status: response.status,
    error: isApiErrorBody(parsed)
      ? parsed
      : { ...NETWORK_ERROR, error: "Respons server tidak dikenali." },
  };
}
