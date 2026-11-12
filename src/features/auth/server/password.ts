import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Parameter scrypt: 2^14 iterasi, blok 8, paralel 1 memakai ±16 MB dan ±50 ms; cukup untuk
// aplikasi pribadi dan masih nyaman di mesin kecil. Disimpan di hash agar bisa dinaikkan nanti.
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const FORMAT = "scrypt";

function derive(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelism: number,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelism },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** Hash kata sandi dengan garam acak. Format: `scrypt$N$r$p$garam$hash` (base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM, KEY_LENGTH);
  return [
    FORMAT,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/** Memeriksa kata sandi terhadap hash tersimpan dalam waktu konstan. Hash rusak dianggap salah. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [format, cost, blockSize, parallelism, salt, hash] = stored.split("$");
  if (format !== FORMAT || !cost || !blockSize || !parallelism || !salt || !hash)
    return false;

  const expected = Buffer.from(hash, "base64");
  try {
    const actual = await derive(
      password,
      Buffer.from(salt, "base64"),
      Number(cost),
      Number(blockSize),
      Number(parallelism),
      expected.length,
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false; // parameter tidak masuk akal (hash dirusak)
  }
}
