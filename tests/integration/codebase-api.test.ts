import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

/** Kontrak HTTP proyek eksisting (M7-03) memakai route handler sungguhan dan database in-memory. */

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;
type Routes = Record<
  string,
  Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>
>;

let routes: Routes;
let cookie = "";
let otherCookie = "";

const url = (path: string) => `http://localhost:3000${path}`;
const noParams = { params: Promise.resolve({}) };
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

function request(method: string, path: string, body?: unknown, as = cookie) {
  return new Request(url(path), {
    method,
    headers: { "content-type": "application/json", cookie: as },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(handler: Handler | undefined, req: Request, ctx = noParams) {
  if (!handler) throw new Error("handler tidak ada");
  const res = await handler(req, ctx);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

async function createCodebase(
  name = "Toko",
  as = cookie,
  source: "zip" | "github" | "agent" = "zip",
) {
  const res = await call(
    routes.create?.POST,
    request("POST", "/api/codebase/create", { name, source }, as),
  );
  expect(res.status).toBe(200);
  return res.json.codebase as { id: string; name: string };
}

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  // Batas upload kecil agar uji 413 tidak perlu mengirim 50 MB.
  process.env.CODEBASE_MAX_UPLOAD_MB = "1";
  const { getDb, runMigrations } = await import("@/server/db/client");
  runMigrations(getDb());
  routes = {
    create: await import("@/app/api/codebase/create/route"),
    list: await import("@/app/api/codebase/list/route"),
    item: await import("@/app/api/codebase/[id]/route"),
    docs: await import("@/app/api/codebase/[id]/docs/route"),
    upload: await import("@/app/api/codebase/[id]/upload/route"),
    github: await import("@/app/api/codebase/[id]/github/route"),
    agentToken: await import("@/app/api/codebase/[id]/agent-token/route"),
    submit: await import("@/app/api/codebase/agent/submit/route"),
    signUp: await import("@/app/api/auth/sign-up/route"),
  } as Routes;

  const signUp = await routes.signUp?.POST?.(
    new Request(url("/api/auth/sign-up"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Pemilik",
        email: "p@piard.local",
        password: "kata-sandi-aman",
      }),
    }),
    noParams,
  );
  cookie = signUp?.headers.get("set-cookie")?.split(";")[0] ?? "";

  // Pengguna kedua dibuat langsung lewat repo karena pendaftaran HTTP sudah tertutup.
  const { createAuthRepo } = await import("@/features/auth/server/repo");
  const { users } = await import("@/server/db/schema");
  const db = getDb();
  db.insert(users)
    .values({ email: "lain@piard.local", passwordHash: "x", name: "Lain" })
    .run();
  const authRepo = createAuthRepo(db);
  const other = authRepo.findUserByEmail("lain@piard.local");
  if (!other) throw new Error("pengguna kedua gagal dibuat");
  const token = randomBytes(8).toString("hex");
  authRepo.insertSession({
    id: createHash("sha256").update(token).digest("hex"),
    userId: other.id,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  otherCookie = `piard_session=${token}`;
});

describe("auth", () => {
  it("semua endpoint codebase menolak permintaan tanpa sesi", async () => {
    const guarded: Array<[Handler | undefined, Request, typeof noParams]> = [
      [
        routes.create?.POST,
        request("POST", "/api/codebase/create", { name: "x", source: "zip" }, ""),
        noParams,
      ],
      [routes.list?.GET, request("GET", "/api/codebase/list", undefined, ""), noParams],
      [
        routes.item?.GET,
        request("GET", "/api/codebase/abc", undefined, ""),
        withId("abc"),
      ],
      [
        routes.item?.PATCH,
        request("PATCH", "/api/codebase/abc", { name: "y" }, ""),
        withId("abc"),
      ],
      [
        routes.item?.DELETE,
        request("DELETE", "/api/codebase/abc", undefined, ""),
        withId("abc"),
      ],
      [
        routes.docs?.GET,
        request("GET", "/api/codebase/abc/docs", undefined, ""),
        withId("abc"),
      ],
    ];
    for (const [handler, req, ctx] of guarded) {
      expect((await call(handler, req, ctx)).status).toBe(401);
    }
  });
});

describe("POST /api/codebase/create", () => {
  it("menolak nama kosong dan sumber tak dikenal", async () => {
    const empty = await call(
      routes.create?.POST,
      request("POST", "/api/codebase/create", { name: "  ", source: "zip" }),
    );
    expect(empty.status).toBe(400);
    expect(empty.json.issues[0]).toMatchObject({
      path: "name",
      message: "Isi nama proyek.",
    });

    const source = await call(
      routes.create?.POST,
      request("POST", "/api/codebase/create", { name: "x", source: "ftp" }),
    );
    expect(source.status).toBe(400);
  });

  it("membuat codebase dengan bahasa bawaan id", async () => {
    const res = await call(
      routes.create?.POST,
      request("POST", "/api/codebase/create", {
        name: "  Toko Online  ",
        source: "github",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.json.codebase).toMatchObject({
      name: "Toko Online",
      source: "github",
      language: "id",
      status: "awaiting_source",
      manifest: null,
    });
    expect(res.json.codebase).not.toHaveProperty("userId");
  });
});

describe("GET/PATCH/DELETE /api/codebase/:id", () => {
  it("membaca, mengganti nama, dan menghapus", async () => {
    const { id } = await createCodebase("Awal");
    const got = await call(
      routes.item?.GET,
      request("GET", `/api/codebase/${id}`),
      withId(id),
    );
    expect(got.json.codebase.name).toBe("Awal");

    const patched = await call(
      routes.item?.PATCH,
      request("PATCH", `/api/codebase/${id}`, { name: "Ganti" }),
      withId(id),
    );
    expect(patched.status).toBe(200);
    expect(patched.json.codebase.name).toBe("Ganti");

    const list = await call(routes.list?.GET, request("GET", "/api/codebase/list"));
    expect(list.json.codebases.map((c: { id: string }) => c.id)).toContain(id);

    const deleted = await call(
      routes.item?.DELETE,
      request("DELETE", `/api/codebase/${id}`),
      withId(id),
    );
    expect(deleted.json).toEqual({ ok: true, keptPlans: 0 });
    const gone = await call(
      routes.item?.GET,
      request("GET", `/api/codebase/${id}`),
      withId(id),
    );
    expect(gone.status).toBe(404);
  });

  it("PATCH hanya menerima nama; field lain diabaikan tanpa efek", async () => {
    const { id } = await createCodebase("Status");
    const res = await call(
      routes.item?.PATCH,
      request("PATCH", `/api/codebase/${id}`, { name: "Status", status: "ready" }),
      withId(id),
    );
    expect(res.status).toBe(200);
    expect(res.json.codebase.status).toBe("awaiting_source");
  });

  it("codebase orang lain dijawab 404, bukan 403", async () => {
    const { id } = await createCodebase("Rahasia");
    for (const [handler, method, body] of [
      [routes.item?.GET, "GET", undefined],
      [routes.item?.PATCH, "PATCH", { name: "Curi" }],
      [routes.item?.DELETE, "DELETE", undefined],
      [routes.docs?.GET, "GET", undefined],
    ] as const) {
      const res = await call(
        handler,
        request(method, `/api/codebase/${id}`, body, otherCookie),
        withId(id),
      );
      expect(res.status).toBe(404);
    }
    const otherList = await call(
      routes.list?.GET,
      request("GET", "/api/codebase/list", undefined, otherCookie),
    );
    expect(otherList.json.codebases).toEqual([]);
    const stillThere = await call(
      routes.item?.GET,
      request("GET", `/api/codebase/${id}`),
      withId(id),
    );
    expect(stillThere.json.codebase.name).toBe("Rahasia");
  });
});

describe("POST /api/codebase/:id/upload", () => {
  const MB = 1024 * 1024;

  /** Badan ZIP mentah dengan header seperti yang dikirim klien. */
  function upload(
    id: string,
    body: BodyInit | null,
    as = cookie,
    headers: Record<string, string> = {},
  ) {
    return call(
      routes.upload?.POST,
      new Request(url(`/api/codebase/${id}/upload`), {
        method: "POST",
        headers: { "content-type": "application/zip", cookie: as, ...headers },
        body,
        duplex: "half",
      } as RequestInit),
      withId(id),
    );
  }

  /** Aliran yang menghitung berapa kali dibaca, untuk memastikan badan tidak disentuh. */
  function countingStream(total: number) {
    const state = { pulls: 0 };
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        state.pulls += 1;
        if (sent >= total) return controller.close();
        sent += 64 * 1024;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    return { stream, state };
  }

  it("menerima ZIP dan mengembalikan codebase berstatus source_ready", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const { id } = await createCodebase("Upload");
    const zip = zipSync({
      "app/README.md": strToU8("# App"),
      "app/main.py": strToU8("print(1)"),
    });
    const res = await upload(id, zip, cookie, {
      "x-file-name": encodeURIComponent("app.zip"),
    });
    expect(res.status).toBe(200);
    expect(res.json.codebase).toMatchObject({
      status: "source_ready",
      sourceRef: "app.zip",
      manifest: { totalFiles: 2 },
      detectedStack: { languages: ["Python"] },
    });
    expect(res.json.codebase.manifest).not.toHaveProperty("files");
    // Bersihkan sumber sementara di folder temp sistem.
    await call(routes.item?.DELETE, request("DELETE", `/api/codebase/${id}`), withId(id));
  });

  it("menolak tanpa sesi (401) dan milik orang lain (404) tanpa membaca badan", async () => {
    const { id } = await createCodebase("Milik saya");
    const anonymous = countingStream(5 * MB);
    expect((await upload(id, anonymous.stream, "")).status).toBe(401);
    expect(anonymous.state.pulls).toBeLessThanOrEqual(1);

    const stranger = countingStream(5 * MB);
    expect((await upload(id, stranger.stream, otherCookie)).status).toBe(404);
    expect(stranger.state.pulls).toBeLessThanOrEqual(1);
  });

  it("413 untuk badan di atas batas, 400 untuk badan kosong atau bukan ZIP", async () => {
    const { id } = await createCodebase("Batas");
    const big = countingStream(5 * MB);
    const tooLarge = await upload(id, big.stream);
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.json.error).toMatch(/melebihi batas 1 MB/);
    // Pembacaan berhenti di sekitar batas (±17 potongan 64 KB), bukan 5 MB penuh.
    expect(big.state.pulls).toBeLessThan(30);

    expect((await upload(id, null)).status).toBe(400);
    const notZip = await upload(id, new TextEncoder().encode("halo"));
    expect(notZip.status).toBe(400);
    expect(notZip.json.error).toMatch(/bukan ZIP/);
  });
});

describe("POST /api/codebase/:id/github", () => {
  // Semua kasus di sini ditolak sebelum jaringan disentuh; unduhan dites dengan fetch tiruan di
  // codebase-github.test.ts.
  const github = (id: string, body: unknown, as = cookie) =>
    call(
      routes.github?.POST,
      request("POST", `/api/codebase/${id}/github`, body, as),
      withId(id),
    );

  it("401 tanpa sesi, 404 milik orang lain, 400 untuk URL/token/sumber yang salah", async () => {
    const { id } = await createCodebase("GitHub", cookie, "github");
    const body = { url: "github.com/toko/web" };
    expect((await github(id, body, "")).status).toBe(401);
    expect((await github(id, body, otherCookie)).status).toBe(404);

    const host = await github(id, { url: "http://localhost:3000/a/b" });
    expect(host.status).toBe(400);
    expect(host.json.error).toMatch(/bukan URL GitHub/);
    expect((await github(id, { url: "" })).status).toBe(400);
    const token = await github(id, {
      url: "github.com/a/b",
      token: "ghp_x\r\nHost: evil",
    });
    expect(token.status).toBe(400);
    expect(JSON.stringify(token.json)).not.toContain("evil");

    const zip = await createCodebase("Zip");
    const wrong = await github(zip.id, body);
    expect(wrong.status).toBe(400);
    expect(wrong.json.error).toMatch(/bersumber GitHub/);
  });
});

describe("token agen dan POST /api/codebase/agent/submit", () => {
  const MB = 1024 * 1024;

  /** Seperti `curl -H "Authorization: Bearer …" --data-binary @docs.json` dari agen (tanpa cookie). */
  const submit = (authorization: string | null, body: BodyInit | null) =>
    call(
      routes.submit?.POST,
      new Request(url("/api/codebase/agent/submit"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authorization ? { authorization } : {}),
        },
        body,
        duplex: "half",
      } as RequestInit),
    );

  it("token dibuat sekali, kiriman agen tersimpan, status dan riwayat terbaca", async () => {
    const { id } = await createCodebase("Agen", cookie, "agent");
    const created = await call(
      routes.agentToken?.POST,
      request("POST", `/api/codebase/${id}/agent-token`),
      withId(id),
    );
    expect(created.status).toBe(200);
    const token = created.json.token as string;
    expect(token).toMatch(/^pcb_/);

    const status = await call(
      routes.agentToken?.GET,
      request("GET", `/api/codebase/${id}/agent-token`),
      withId(id),
    );
    expect(status.json).toMatchObject({ active: true, lastUsedAt: null });
    expect(JSON.stringify(status.json)).not.toContain(token);

    const res = await submit(
      `Bearer ${token}`,
      JSON.stringify({ pages: [{ slug: "ringkasan", content: "# Agen" }] }),
    );
    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      codebaseId: id,
      added: ["ringkasan"],
      proposed: [],
      redactions: 0,
    });
    expect(JSON.stringify(res.json)).not.toContain(token);

    const item = await call(
      routes.item?.GET,
      request("GET", `/api/codebase/${id}`),
      withId(id),
    );
    expect(item.json.codebase.status).toBe("ready");

    // Token orang lain tidak bisa dibuat, dan cookie tidak menggantikan Bearer.
    const stranger = await call(
      routes.agentToken?.POST,
      request("POST", `/api/codebase/${id}/agent-token`, undefined, otherCookie),
      withId(id),
    );
    expect(stranger.status).toBe(404);
    const withCookie = await call(
      routes.submit?.POST,
      request("POST", "/api/codebase/agent/submit", { pages: [] }),
    );
    expect(withCookie.status).toBe(401);

    const revoked = await call(
      routes.agentToken?.DELETE,
      request("DELETE", `/api/codebase/${id}/agent-token`),
      withId(id),
    );
    expect(revoked.json).toEqual({ revoked: 1 });
    const after = await submit(`Bearer ${token}`, JSON.stringify({ pages: [] }));
    expect(after.status).toBe(401);
  });

  it("401 sebelum badan dibaca; 413 di atas 1 MB; 400 untuk skema tidak valid", async () => {
    const { id } = await createCodebase("Batas agen", cookie, "agent");
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 40) return controller.close();
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    expect((await submit(null, stream)).status).toBe(401);
    expect(pulls).toBeLessThanOrEqual(1);

    const { json } = await call(
      routes.agentToken?.POST,
      request("POST", `/api/codebase/${id}/agent-token`),
      withId(id),
    );
    const auth = `Bearer ${json.token}`;
    const big = JSON.stringify({
      pages: [{ slug: "ringkasan", content: "x".repeat(MB + 10) }],
    });
    const tooLarge = await submit(auth, big);
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.json.error).toMatch(/melebihi 1 MB/);

    const invalid = await submit(
      auth,
      JSON.stringify({ pages: [{ slug: "x", content: "y" }] }),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.json.issues?.[0]?.path).toBe("pages.0.slug");
    expect((await submit(auth, null)).status).toBe(400);
  });
});

describe("GET /api/codebase/:id/docs", () => {
  it("daftar kosong, slug tak dikenal 400, version tanpa slug 400, halaman belum ada 404", async () => {
    const { id } = await createCodebase("Docs");
    const docs = (query: string) =>
      call(
        routes.docs?.GET,
        request("GET", `/api/codebase/${id}/docs${query}`),
        withId(id),
      );

    expect((await docs("")).json).toEqual({ pages: [] });
    expect((await docs("?slug=rahasia")).status).toBe(400);
    expect((await docs("?version=1")).status).toBe(400);
    expect((await docs("?slug=ringkasan&version=0")).status).toBe(400);
    expect((await docs("?slug=ringkasan")).status).toBe(404);
  });

  it("mengembalikan halaman dan riwayatnya", async () => {
    const { id } = await createCodebase("Isi");
    const { getCodebaseRepo } = await import("@/features/codebase/server/repo");
    getCodebaseRepo().addDocVersions(id, [
      { slug: "ringkasan", title: "Ringkasan", content: "# v1", origin: "agent" },
    ]);
    getCodebaseRepo().addDocVersions(id, [
      { slug: "ringkasan", title: "Ringkasan", content: "# v2", origin: "manual" },
    ]);

    const list = await call(
      routes.docs?.GET,
      request("GET", `/api/codebase/${id}/docs`),
      withId(id),
    );
    expect(list.json.pages).toHaveLength(1);
    expect(list.json.pages[0]).toMatchObject({
      slug: "ringkasan",
      version: 2,
      origin: "manual",
    });

    const one = await call(
      routes.docs?.GET,
      request("GET", `/api/codebase/${id}/docs?slug=ringkasan&version=1`),
      withId(id),
    );
    expect(one.json.page).toMatchObject({ version: 1, content: "# v1", origin: "agent" });
    expect(one.json.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });
});
