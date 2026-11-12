import "server-only";

import {
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
} from "ai";
import { isAnthropicModel } from "@/server/config/env";
import { AppError } from "@/server/http/errors";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_PAYMENT_REQUIRED = 402;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
const HTTP_RATE_LIMITED = 429;
const DETAIL_MAX_LENGTH = 200;

/** Nama galat saat permintaan dibatalkan (klien putus); bukan kegagalan AI. */
function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/**
 * Alasan penolakan dari badan respons OpenRouter atau Anthropic (keduanya `{error: {message}}`). Hanya pesan itu yang
 * diambil; bidang lain (mis. `user_id`) tidak ikut ditampilkan.
 */
function providerMessage(responseBody: string | undefined): string | undefined {
  if (!responseBody) return undefined;
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (typeof parsed !== "object" || parsed === null || !("error" in parsed))
      return undefined;
    const { error } = parsed;
    if (typeof error !== "object" || error === null || !("message" in error))
      return undefined;
    return typeof error.message === "string"
      ? error.message.slice(0, DETAIL_MAX_LENGTH)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Nama penyedia dan variabel kuncinya, untuk pesan yang bisa ditindaklanjuti. */
function providerOf(model: string | undefined) {
  return model && isAnthropicModel(model)
    ? { name: "Anthropic", keyVar: "ANTHROPIC_API_KEY", billing: "console.anthropic.com" }
    : { name: "OpenRouter", keyVar: "OPENROUTER_API_KEY", billing: "openrouter.ai" };
}

/**
 * Mengubah galat dari SDK/penyedia menjadi `AppError("UPSTREAM_AI")` dengan pesan
 * yang memberi tahu pengguna apa yang bisa dilakukan. Pembatalan dilempar ulang apa adanya.
 */
export function toUpstreamError(error: unknown, model?: string): unknown {
  if (error instanceof AppError || isAbort(error)) return error;
  // SDK membungkus galat yang sudah dicoba ulang; pesan yang berguna ada di galat terakhir.
  if (RetryError.isInstance(error) && error.lastError !== undefined) {
    const mapped = toUpstreamError(error.lastError, model);
    return mapped instanceof AppError
      ? new AppError(mapped.code, mapped.message, mapped.status, error)
      : mapped;
  }

  if (APICallError.isInstance(error)) {
    const provider = providerOf(model);
    switch (error.statusCode) {
      case HTTP_UNAUTHORIZED:
      case HTTP_FORBIDDEN:
        return new AppError(
          "UPSTREAM_AI",
          `${provider.name} menolak kunci API. Periksa ${provider.keyVar} di .env.`,
          502,
          error,
        );
      case HTTP_PAYMENT_REQUIRED:
        return new AppError(
          "UPSTREAM_AI",
          `Saldo ${provider.name} tidak cukup. Isi saldo di ${provider.billing} lalu coba lagi.`,
          502,
          error,
        );
      case HTTP_BAD_REQUEST:
      case HTTP_NOT_FOUND:
      case HTTP_UNPROCESSABLE: {
        const name = model ? `"${model}"` : "yang dipilih";
        const reason =
          providerMessage(error.responseBody) ??
          (error.statusCode === HTTP_NOT_FOUND
            ? "model tidak ditemukan"
            : "permintaan ditolak");
        return new AppError(
          "UPSTREAM_AI",
          `Model ${name} tidak bisa dipakai: ${reason}. Periksa MODEL_* di .env (harus model teks yang mendukung structured output).`,
          502,
          error,
        );
      }
      case HTTP_RATE_LIMITED:
        if (/free-models-per-day/i.test(`${error.message} ${error.responseBody ?? ""}`)) {
          return new AppError(
            "UPSTREAM_AI",
            `Kuota harian model gratis OpenRouter habis${model ? ` (${model})` : ""}. Coba lagi besok, isi kredit di openrouter.ai (kuota naik menjadi 1.000 permintaan per hari), atau ganti MODEL_* ke model berbayar di .env.`,
            502,
            error,
          );
        }
        return new AppError(
          "UPSTREAM_AI",
          `${provider.name} membatasi permintaan. Tunggu sebentar lalu coba lagi.`,
          502,
          error,
        );
    }
  }

  if (NoObjectGeneratedError.isInstance(error)) {
    return new AppError(
      "UPSTREAM_AI",
      "AI mengembalikan format yang tidak sesuai. Coba lagi; bila berulang, ganti model di .env.",
      502,
      error,
    );
  }

  if (NoOutputGeneratedError.isInstance(error)) {
    return new AppError(
      "UPSTREAM_AI",
      "AI berhenti sebelum selesai menulis. Coba lagi sebentar lagi.",
      502,
      error,
    );
  }

  return new AppError(
    "UPSTREAM_AI",
    "Layanan AI sedang bermasalah. Coba lagi sebentar lagi.",
    502,
    error,
  );
}

/**
 * True bila galat berarti panggilan berikutnya ke penyedia yang sama pasti gagal juga (kunci ditolak,
 * saldo habis, kuota, batas laju, atau batas biaya Piard), sehingga job sebaiknya berhenti alih-alih
 * mencoba item lain.
 */
export function blocksFurtherCalls(error: unknown): boolean {
  if (error instanceof AppError && error.code === "BUDGET_EXCEEDED") return true;
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    if (APICallError.isInstance(current)) {
      return [
        HTTP_UNAUTHORIZED,
        HTTP_PAYMENT_REQUIRED,
        HTTP_FORBIDDEN,
        HTTP_RATE_LIMITED,
      ].includes(current.statusCode ?? 0);
    }
    if (RetryError.isInstance(current)) current = current.lastError;
    else if (current instanceof Error) current = current.cause;
    else return false;
  }
  return false;
}
