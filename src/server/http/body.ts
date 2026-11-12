import "server-only";

import { AppError } from "./errors";

const PAYLOAD_TOO_LARGE = 413;

/** Permintaan masuk atau respons unduhan: keduanya punya header dan badan stream. */
type BodySource = Pick<Request, "headers" | "body">;

/**
 * Membaca badan biner (permintaan atau respons unduhan) dengan batas byte. `Content-Length` hanya dipakai untuk menolak lebih
 * awal; badan tetap dihitung saat dibaca (header bisa tidak ada atau berbohong), dan pembacaan dihentikan
 * begitu batas terlampaui sehingga memori tidak pernah melebihi `maxBytes`.
 *
 * @param tooLarge pesan untuk pengguna bila badan melebihi batas.
 * @throws {AppError} `VALIDATION` 413 bila terlalu besar, 400 bila kosong.
 */
export async function readBodyLimited(
  request: BodySource,
  maxBytes: number,
  messages: { tooLarge: string; empty: string },
): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError("VALIDATION", messages.tooLarge, PAYLOAD_TOO_LARGE);
  }
  if (!request.body) throw new AppError("VALIDATION", messages.empty);

  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError("VALIDATION", messages.tooLarge, PAYLOAD_TOO_LARGE);
    }
    parts.push(value);
  }
  if (size === 0) throw new AppError("VALIDATION", messages.empty);

  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  return body;
}
