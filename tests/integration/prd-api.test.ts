import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prdStateSchema } from "@/features/prd";

/** Kontrak HTTP PRD memakai route handler sungguhan, job runner proses, dan LLM mock. */

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;
type Routes = Record<string, Partial<Record<"GET" | "POST", Handler>>>;

let routes: Routes;
let cookie = "";
let otherCookie = "";
let idle: () => Promise<void>;

const url = (path: string) => `http://localhost:3000${path}`;
const noParams = { params: Promise.resolve({}) };

function request(method: string, path: string, body?: unknown, as = cookie) {
  return new Request(url(path), {
    method,
    headers: { "content-type": "application/json", cookie: as },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(handler: Handler | undefined, req: Request) {
  if (!handler) throw new Error("handler tidak ada");
  const res = await handler(req, noParams);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.LLM_MODE = "mock";
  const { getDb, runMigrations } = await import("@/server/db/client");
  runMigrations(getDb());
  const { startJobRunner } = await import("@/server/jobs");
  const { roadmapJobHandlers } = await import("@/features/roadmap/server");
  const { prdJobHandlers } = await import("@/features/prd/server");
  const runner = startJobRunner({ ...roadmapJobHandlers, ...prdJobHandlers });
  idle = () => runner.idle();

  routes = {
    signUp: await import("@/app/api/auth/sign-up/route"),
    create: await import("@/app/api/plan/create/route"),
    roadmap: await import("@/app/api/plan/roadmap/generate/route"),
    prd: await import("@/app/api/plan/generate/route"),
    save: await import("@/app/api/plan/save-document/route"),
    documents: await import("@/app/api/plan/documents/route"),
    restore: await import("@/app/api/plan/documents/restore/route"),
    exportMd: await import("@/app/api/plan/export/route"),
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
}, 30_000);

describe("PRD lewat HTTP", () => {
  let planId = "";

  it("menolak permintaan tanpa sesi", async () => {
    expect(
      (
        await call(
          routes.prd?.POST,
          request("POST", "/api/plan/generate", { planId: "x" }, ""),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          routes.prd?.GET,
          request("GET", "/api/plan/generate?planId=x", undefined, ""),
        )
      ).status,
    ).toBe(401);
  });

  it("menolak membuat PRD sebelum roadmap ada (409)", async () => {
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", {
        idea: "Aplikasi katering harian",
        language: "id",
      }),
    );
    planId = created.json.plan?.id ?? created.json.id;
    expect(planId).toBeTruthy();
    const res = await call(
      routes.prd?.POST,
      request("POST", "/api/plan/generate", { planId }),
    );
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("CONFLICT");
  });

  it("membuat PRD setelah roadmap siap; GET mengembalikan versi 1", async () => {
    await call(
      routes.roadmap?.POST,
      request("POST", "/api/plan/roadmap/generate", { planId }),
    );
    await idle();

    const started = await call(
      routes.prd?.POST,
      request("POST", "/api/plan/generate", { planId }),
    );
    expect(started).toEqual({ status: 200, json: { status: "generating" } });
    await idle();

    const res = await call(
      routes.prd?.GET,
      request("GET", `/api/plan/generate?planId=${planId}`),
    );
    expect(res.status).toBe(200);
    const state = prdStateSchema.parse(res.json);
    expect(state).toMatchObject({
      status: "ready",
      document: { version: 1, title: "PRD" },
    });
    expect(state.document?.content).toMatch(/^# PRD - /);
  });

  it("pengguna lain mendapat 404 dan body yang salah mendapat 400", async () => {
    const other = await call(
      routes.prd?.GET,
      request("GET", `/api/plan/generate?planId=${planId}`, undefined, otherCookie),
    );
    expect(other.status).toBe(404);
    const bad = await call(
      routes.prd?.POST,
      request("POST", "/api/plan/generate", { planId, regenerate: "ya" }),
    );
    expect(bad.status).toBe(400);
  });

  it("simpan, riwayat, ambil versi, dan pulihkan", async () => {
    const saved = await call(
      routes.save?.POST,
      request("POST", "/api/plan/save-document", {
        planId,
        content: "# PRD - Edit\n\nisi",
      }),
    );
    expect(saved.status).toBe(200);
    expect(saved.json.document).toMatchObject({
      version: 2,
      content: "# PRD - Edit\n\nisi\n",
    });

    const list = await call(
      routes.documents?.GET,
      request("GET", `/api/plan/documents?planId=${planId}`),
    );
    expect(list.json.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(list.json.versions[0].content).toBeUndefined();

    const v1 = await call(
      routes.documents?.GET,
      request("GET", `/api/plan/documents?planId=${planId}&version=1`),
    );
    expect(v1.json.document.content).toMatch(/^# PRD - /);

    const restored = await call(
      routes.restore?.POST,
      request("POST", "/api/plan/documents/restore", { planId, version: 1 }),
    );
    expect(restored.json.document).toMatchObject({
      version: 3,
      content: v1.json.document.content,
    });
  });

  it("validasi dan otorisasi edit", async () => {
    const empty = await call(
      routes.save?.POST,
      request("POST", "/api/plan/save-document", { planId, content: "   " }),
    );
    expect(empty.status).toBe(400);
    const tooLong = await call(
      routes.save?.POST,
      request("POST", "/api/plan/save-document", {
        planId,
        content: "x".repeat(100_001),
      }),
    );
    expect(tooLong.status).toBe(400);
    const other = await call(
      routes.save?.POST,
      request("POST", "/api/plan/save-document", { planId, content: "# x" }, otherCookie),
    );
    expect(other.status).toBe(404);
    const missing = await call(
      routes.documents?.GET,
      request("GET", `/api/plan/documents?planId=${planId}&version=99`),
    );
    expect(missing.status).toBe(404);
    const anon = await call(
      routes.restore?.POST,
      request("POST", "/api/plan/documents/restore", { planId, version: 1 }, ""),
    );
    expect(anon.status).toBe(401);
  });

  it("unduh Markdown: nama berkas slug, versi lama berakhiran -v<n>", async () => {
    const handler = routes.exportMd?.GET;
    if (!handler) throw new Error("handler tidak ada");
    const latest = await handler(
      request("GET", `/api/plan/export?planId=${planId}&format=md`),
      noParams,
    );
    expect(latest.status).toBe(200);
    expect(latest.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(latest.headers.get("content-disposition")).toBe(
      'attachment; filename="aplikasi-katering-harian-PRD.md"',
    );
    expect(await latest.text()).toMatch(/^# PRD - /);

    const old = await handler(
      request("GET", `/api/plan/export?planId=${planId}&version=2`),
      noParams,
    );
    expect(old.headers.get("content-disposition")).toBe(
      'attachment; filename="aplikasi-katering-harian-PRD-v2.md"',
    );
    expect(await old.text()).toBe("# PRD - Edit\n\nisi\n");

    expect(
      (
        await call(
          handler,
          request("GET", `/api/plan/export?planId=${planId}&format=pdf`),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          handler,
          request("GET", `/api/plan/export?planId=${planId}`, undefined, otherCookie),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          handler,
          request("GET", `/api/plan/export?planId=${planId}`, undefined, ""),
        )
      ).status,
    ).toBe(401);
  });

  it("unduh sebelum PRD ada → 404", async () => {
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "Ide tanpa PRD", language: "id" }),
    );
    const res = await call(
      routes.exportMd?.GET,
      request("GET", `/api/plan/export?planId=${created.json.plan.id}`),
    );
    expect(res.status).toBe(404);
  });
});
