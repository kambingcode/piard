import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getEnv } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { createRouteBuilder } from "@/server/http/route";
import { authCopy } from "../copy";
import type { AuthUser } from "../types";
import { readSessionToken, SESSION_COOKIE } from "./cookie";
import { getAuthRepo } from "./repo";
import { type AuthService, createAuthService } from "./service";

export const SIGN_IN_PATH = "/sign-in";

let service: AuthService | undefined;

/** Service auth proses ini (menyimpan hitungan percobaan gagal di memori, jadi satu instans). */
export function getAuthService(): AuthService {
  service ??= createAuthService({
    repo: getAuthRepo(),
    sessionTtlDays: getEnv().sessionTtlDays,
  });
  return service;
}

/** Pengguna pada permintaan API ini, atau `UNAUTHORIZED`. */
export async function authenticateRequest(request: Request): Promise<AuthUser> {
  const token = readSessionToken(request);
  const user = token ? getAuthService().userFromToken(token) : undefined;
  if (!user) throw new AppError("UNAUTHORIZED", authCopy.errors.notSignedIn);
  return user;
}

/** Pembangun route yang mewajibkan sesi; handler menerima `ctx.user`. */
export const authedRoute = createRouteBuilder(authenticateRequest, "session");

/**
 * Pengguna untuk Server Component, atau null. Di-cache per permintaan agar layout dan halaman
 * yang memanggilnya bersamaan hanya membaca database sekali.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? (getAuthService().userFromToken(token) ?? null) : null;
});

/** Untuk halaman/layout area masuk: mengalihkan ke /sign-in bila belum masuk. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}
