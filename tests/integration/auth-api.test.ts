import { beforeAll, describe, expect, it } from "vitest";

/**
 * Menguji kontrak HTTP auth memakai route handler sungguhan dan database in-memory.
 * Env diatur sebelum modul server diimpor karena env dan koneksi DB disimpan per proses.
 */

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, never>> },
) => Promise<Response>;
const context = { params: Promise.resolve({}) };

let routes: {
  status: { GET: Handler };
  signUp: { POST: Handler };
  signIn: { POST: Handler };
  signOut: { POST: Handler };
  me: { GET: Handler };
};

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  const { getDb, runMigrations } = await import("@/server/db/client");
  runMigrations(getDb());
  routes = {
    status: await import("@/app/api/auth/status/route"),
    signUp: await import("@/app/api/auth/sign-up/route"),
    signIn: await import("@/app/api/auth/sign-in/route"),
    signOut: await import("@/app/api/auth/sign-out/route"),
    me: await import("@/app/api/auth/me/route"),
  };
});

const url = (path: string) => `http://localhost:3000${path}`;
const json = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

/** Nama=nilai dari header Set-Cookie, siap dikirim balik sebagai header Cookie. */
const cookieFrom = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0] ?? "";

const OWNER = {
  name: "Pemilik",
  email: "Pemilik@Piard.Local ",
  password: "kata-sandi-aman",
};

describe("API auth", () => {
  let cookie = "";

  it("menolak /me tanpa sesi dengan UNAUTHORIZED", async () => {
    const res = await routes.me.GET(new Request(url("/api/auth/me")), context);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("status: pendaftaran terbuka di awal", async () => {
    const res = await routes.status.GET(new Request(url("/api/auth/status")), context);
    expect(await res.json()).toEqual({ signUpOpen: true });
  });

  it("sign-up menolak masukan tidak valid dengan daftar masalah per kolom", async () => {
    const res = await routes.signUp.POST(
      json("/api/auth/sign-up", { name: "", email: "bukan-email", password: "pendek" }),
      context,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION");
    expect(body.issues.map((i: { path: string }) => i.path).sort()).toEqual([
      "email",
      "name",
      "password",
    ]);
  });

  it("sign-up membuat akun, menormalkan email, dan memasang cookie sesi aman", async () => {
    const res = await routes.signUp.POST(json("/api/auth/sign-up", OWNER), context);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: expect.any(String), email: "pemilik@piard.local", name: "Pemilik" },
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^piard_session=[^;]+;/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    cookie = cookieFrom(res);
  });

  it("tidak pernah mengembalikan hash kata sandi", async () => {
    const res = await routes.me.GET(
      new Request(url("/api/auth/me"), { headers: { cookie } }),
      context,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/passwordHash|scrypt/);
    expect(JSON.parse(text).user.email).toBe("pemilik@piard.local");
  });

  it("menutup pendaftaran setelah akun pertama", async () => {
    const status = await routes.status.GET(new Request(url("/api/auth/status")), context);
    expect(await status.json()).toEqual({ signUpOpen: false });

    const res = await routes.signUp.POST(
      json("/api/auth/sign-up", { ...OWNER, email: "lain@piard.local" }),
      context,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CONFLICT" });
  });

  it("sign-in salah: 401 dengan pesan generik, tanpa cookie", async () => {
    const res = await routes.signIn.POST(
      json("/api/auth/sign-in", {
        email: "pemilik@piard.local",
        password: "salah-banget",
      }),
      context,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await res.json()).error).toBe("Email atau kata sandi salah.");
  });

  it("sign-out menghapus sesi di server dan cookie di browser", async () => {
    const out = await routes.signOut.POST(
      new Request(url("/api/auth/sign-out"), { method: "POST", headers: { cookie } }),
      context,
    );
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");

    // Cookie lama yang dicuri/ditahan tidak boleh berlaku lagi.
    const me = await routes.me.GET(
      new Request(url("/api/auth/me"), { headers: { cookie } }),
      context,
    );
    expect(me.status).toBe(401);
  });

  it("sign-in benar memberi sesi baru yang bisa dipakai", async () => {
    const res = await routes.signIn.POST(
      json("/api/auth/sign-in", {
        email: " PEMILIK@piard.local",
        password: "kata-sandi-aman",
      }),
      context,
    );
    expect(res.status).toBe(200);
    const me = await routes.me.GET(
      new Request(url("/api/auth/me"), { headers: { cookie: cookieFrom(res) } }),
      context,
    );
    expect(me.status).toBe(200);
  });

  it("sign-out tanpa sesi tetap 204", async () => {
    const res = await routes.signOut.POST(
      new Request(url("/api/auth/sign-out"), { method: "POST" }),
      context,
    );
    expect(res.status).toBe(204);
  });

  it("menandai cookie Secure di belakang proxy HTTPS", async () => {
    const res = await routes.signIn.POST(
      json(
        "/api/auth/sign-in",
        { email: "pemilik@piard.local", password: "kata-sandi-aman" },
        { "x-forwarded-proto": "https" },
      ),
      context,
    );
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });
});
