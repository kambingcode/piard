import { createHash, randomBytes } from "node:crypto";

/**
 * Pemanggil route handler sungguhan untuk tes integrasi (pola `codebase-security.test.ts`): database
 * `:memory:` lewat env, satu akun lewat sign-up, akun kedua dengan sesi langsung di tabel.
 */

export type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;
export type Methods = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;
export type Json = Record<string, unknown>;

export const url = (path: string) => `http://localhost:3000${path}`;

export type RequestOptions = {
  cookie?: string;
  bearer?: string;
  headers?: Record<string, string>;
  raw?: string;
};

export function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
    ...options.headers,
  };
  return new Request(url(path), {
    method,
    headers,
    body: options.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

export async function callRoute(
  handler: Handler | undefined,
  request: Request,
  params: Record<string, string> = {},
): Promise<{ status: number; json: Json; headers: Headers }> {
  if (!handler) throw new Error("handler tidak ada");
  const res = await handler(request, { params: Promise.resolve(params) });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { text };
  }
  return { status: res.status, json: json as Json, headers: res.headers };
}

/** Menyiapkan DB `:memory:`, migrasi, dan dua pengguna; mengembalikan cookie dan id keduanya. */
export async function setupUsers() {
  process.env.DATABASE_PATH = ":memory:";
  const { getDb, runMigrations } = await import("@/server/db/client");
  runMigrations(getDb());
  const signUp = await import("@/app/api/auth/sign-up/route");
  const res = await signUp.POST(
    new Request(url("/api/auth/sign-up"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "A",
        email: "a@piard.local",
        password: "kata-sandi-aman",
      }),
    }),
    { params: Promise.resolve({}) },
  );
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";

  const { createAuthRepo } = await import("@/features/auth/server/repo");
  const { users } = await import("@/server/db/schema");
  getDb()
    .insert(users)
    .values({ email: "b@piard.local", passwordHash: "x", name: "B" })
    .run();
  const auth = createAuthRepo(getDb());
  const owner = auth.findUserByEmail("a@piard.local");
  const other = auth.findUserByEmail("b@piard.local");
  if (!owner || !other) throw new Error("pengguna tes gagal dibuat");
  const token = randomBytes(8).toString("hex");
  auth.insertSession({
    id: createHash("sha256").update(token).digest("hex"),
    userId: other.id,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return {
    db: getDb(),
    cookie,
    otherCookie: `piard_session=${token}`,
    userId: owner.id,
    otherId: other.id,
  };
}
