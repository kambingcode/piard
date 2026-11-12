import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Token Bearer berawalan (ADR 0016 `pcb_`, ADR 0017 `ppl_`): 32 byte acak base64url. Awalan membuat token
 * mudah dikenali pemindai rahasia. Hanya hash SHA-256 yang disimpan; token mentah tidak pernah dicatat.
 */
const TOKEN_BYTES = 32;
const BEARER = /^Bearer\s+(\S+)$/i;

export type BearerTokenKind = {
  /** Mis. `"ppl_"`. */
  prefix: string;
  pattern: RegExp;
};

/** Jenis token dengan awalan tertentu; bentuk lain ditolak sebelum menyentuh database. */
export function bearerTokenKind(prefix: string): BearerTokenKind {
  // 32 byte base64url = 43 karakter tanpa padding.
  return { prefix, pattern: new RegExp(`^${prefix}[A-Za-z0-9_-]{43}$`) };
}

export const hashBearerToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function generateBearerToken(kind: BearerTokenKind): {
  token: string;
  hash: string;
} {
  const token = `${kind.prefix}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  return { token, hash: hashBearerToken(token) };
}

/**
 * Token dari header `Authorization: Bearer …` yang bentuknya cocok, beserta hash-nya; selain itu null.
 * Pemanggil mencari baris lewat hash lalu memanggil {@link sameHash}.
 */
export function readBearerToken(
  authorization: string | null,
  kind: BearerTokenKind,
): { token: string; hash: string } | null {
  const token = BEARER.exec(authorization?.trim() ?? "")?.[1];
  if (!token || !kind.pattern.test(token)) return null;
  return { token, hash: hashBearerToken(token) };
}

/** Pembandingan hash hex dengan waktu konstan (lapisan kedua setelah pencarian lewat indeks unik). */
export function sameHash(stored: string, computed: string): boolean {
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(computed, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
