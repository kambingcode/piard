import "server-only";

import type { SignInInput, SignUpInput } from "../schemas";
import type { AuthStatus } from "../types";
import {
  clearedSessionCookie,
  isSecureRequest,
  readSessionToken,
  sessionCookie,
} from "./cookie";
import type { StartedSession } from "./service";
import { getAuthService } from "./session";

/** Respons yang membawa atau menghapus sesi tidak boleh di-cache. */
const NO_STORE = "no-store";

function withSession(session: StartedSession, request: Request): Response {
  return Response.json(
    { user: session.user },
    {
      headers: {
        "Cache-Control": NO_STORE,
        "Set-Cookie": sessionCookie(session.token, session.expiresAt, {
          secure: isSecureRequest(request),
        }),
      },
    },
  );
}

/** Membuat akun pemilik lalu langsung masuk. Respons membawa cookie sesi. */
export async function signUpFlow(
  request: Request,
  input: SignUpInput,
): Promise<Response> {
  return withSession(await getAuthService().signUp(input), request);
}

export async function signInFlow(
  request: Request,
  input: SignInInput,
): Promise<Response> {
  return withSession(await getAuthService().signIn(input), request);
}

/** Menghapus sesi di server dan di browser. Aman dipanggil tanpa sesi. */
export function signOutFlow(request: Request): Response {
  const token = readSessionToken(request);
  if (token) getAuthService().signOut(token);
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": NO_STORE,
      "Set-Cookie": clearedSessionCookie({ secure: isSecureRequest(request) }),
    },
  });
}

export function getAuthStatus(): AuthStatus {
  return { signUpOpen: getAuthService().isSignUpOpen() };
}
