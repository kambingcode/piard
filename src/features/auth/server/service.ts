import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@/server/http/errors";
import { authCopy } from "../copy";
import type { SignInInput, SignUpInput } from "../schemas";
import type { AuthUser } from "../types";
import { hashPassword, verifyPassword } from "./password";
import type { AuthRepo } from "./repo";

const TOKEN_BYTES = 32;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * MINUTE_MS;
/** Batas ukuran catatan percobaan gagal agar tidak tumbuh tanpa batas. */
const MAX_TRACKED_EMAILS = 1_000;
const HTTP_TOO_MANY_REQUESTS = 429;

export type StartedSession = {
  user: AuthUser;
  /** Token mentah untuk cookie; database hanya menyimpan hash-nya. */
  token: string;
  expiresAt: Date;
};

export type AuthServiceDeps = {
  repo: AuthRepo;
  sessionTtlDays: number;
  now?: () => Date;
  hash?: (password: string) => Promise<string>;
  verify?: (password: string, hash: string) => Promise<boolean>;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Aturan bisnis autentikasi: pendaftaran pengguna tunggal, masuk, sesi, dan keluar.
 * Tidak tahu soal cookie/HTTP (lihat session.ts) sehingga mudah dites.
 */
export function createAuthService({
  repo,
  sessionTtlDays,
  now = () => new Date(),
  hash = hashPassword,
  verify = verifyPassword,
}: AuthServiceDeps) {
  const failures = new Map<string, { count: number; lockedUntil: number }>();
  let decoyHash: Promise<string> | undefined;

  function startSession(user: AuthUser): StartedSession {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(now().getTime() + sessionTtlDays * DAY_MS);
    repo.deleteExpiredSessions(now());
    repo.insertSession({ id: hashToken(token), userId: user.id, expiresAt });
    return { user, token, expiresAt };
  }

  function assertNotLocked(email: string) {
    const entry = failures.get(email);
    const remaining = entry ? entry.lockedUntil - now().getTime() : 0;
    if (remaining > 0) {
      throw new AppError(
        "UNAUTHORIZED",
        authCopy.errors.tooManyAttempts(Math.ceil(remaining / MINUTE_MS)),
        HTTP_TOO_MANY_REQUESTS,
      );
    }
  }

  function recordFailure(email: string) {
    if (failures.size >= MAX_TRACKED_EMAILS) failures.clear();
    const previous = failures.get(email);
    // Setelah masa kunci lewat, hitungan dimulai dari awal.
    const stale =
      previous && previous.lockedUntil > 0 && previous.lockedUntil <= now().getTime();
    const count = (stale ? 0 : (previous?.count ?? 0)) + 1;
    failures.set(email, {
      count,
      lockedUntil: count >= MAX_FAILED_ATTEMPTS ? now().getTime() + LOCKOUT_MS : 0,
    });
  }

  return {
    isSignUpOpen: () => repo.countUsers() === 0,

    /**
     * Membuat akun pemilik. Hanya berhasil untuk pengguna pertama.
     * @throws {AppError} `CONFLICT` bila sudah ada akun.
     */
    async signUp(input: SignUpInput): Promise<StartedSession> {
      if (repo.countUsers() > 0)
        throw new AppError("CONFLICT", authCopy.errors.signUpClosed);
      const user = repo.createFirstUser({
        email: input.email,
        name: input.name,
        passwordHash: await hash(input.password),
      });
      if (!user) throw new AppError("CONFLICT", authCopy.errors.signUpClosed);
      return startSession(user);
    },

    /**
     * @throws {AppError} `UNAUTHORIZED` bila email/kata sandi salah (pesan sama untuk keduanya)
     *   atau terlalu banyak percobaan gagal.
     */
    async signIn(input: SignInInput): Promise<StartedSession> {
      assertNotLocked(input.email);
      const found = repo.findUserByEmail(input.email);
      // Tetap menghitung hash bila email tidak ada, agar waktu respons tidak membocorkan keberadaannya.
      decoyHash ??= hash("decoy-password");
      const valid = await verify(
        input.password,
        found?.passwordHash ?? (await decoyHash),
      );

      if (!found || !valid) {
        recordFailure(input.email);
        throw new AppError("UNAUTHORIZED", authCopy.errors.wrongCredentials);
      }
      failures.delete(input.email);
      return startSession({ id: found.id, email: found.email, name: found.name });
    },

    userFromToken(token: string): AuthUser | undefined {
      return repo.findSessionUser(hashToken(token), now());
    },

    signOut(token: string): void {
      repo.deleteSession(hashToken(token));
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
