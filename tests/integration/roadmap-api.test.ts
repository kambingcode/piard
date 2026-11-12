import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { roadmapStateSchema } from "@/features/roadmap";
import { HAS_SAMPLES, isRecord, loadSample } from "../helpers/api-samples";

/** Kontrak HTTP roadmap memakai route handler sungguhan, job runner proses, dan LLM mock. */

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
let idle: () => Promise<void>;

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

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.LLM_MODE = "mock";
  const { getDb, runMigrations } = await import("@/server/db/client");
  runMigrations(getDb());
  const { startJobRunner } = await import("@/server/jobs");
  const { roadmapJobHandlers } = await import("@/features/roadmap/server");
  const runner = startJobRunner(roadmapJobHandlers);
  idle = () => runner.idle();

  routes = {
    signUp: await import("@/app/api/auth/sign-up/route"),
    create: await import("@/app/api/plan/create/route"),
    generate: await import("@/app/api/plan/roadmap/generate/route"),
    featureList: await import("@/app/api/plan/features/list/route"),
    featureCreate: await import("@/app/api/plan/features/create/route"),
    feature: await import("@/app/api/plan/features/[id]/route"),
    subList: await import("@/app/api/plan/subfeatures/list/route"),
    subCreate: await import("@/app/api/plan/subfeatures/create/route"),
    sub: await import("@/app/api/plan/subfeatures/[id]/route"),
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

describe("roadmap lewat HTTP", () => {
  let planId = "";
  let featureId = "";
  let subId = "";

  it("semua endpoint menolak permintaan tanpa sesi", async () => {
    const guarded: Array<[Handler | undefined, Request, typeof noParams]> = [
      [
        routes.generate?.POST,
        request("POST", "/api/plan/roadmap/generate", { planId: "x" }, ""),
        noParams,
      ],
      [
        routes.generate?.GET,
        request("GET", "/api/plan/roadmap/generate?planId=x", undefined, ""),
        noParams,
      ],
      [
        routes.featureList?.GET,
        request("GET", "/api/plan/features/list?planId=x", undefined, ""),
        noParams,
      ],
      [
        routes.featureCreate?.POST,
        request("POST", "/api/plan/features/create", { planId: "x", name: "a" }, ""),
        noParams,
      ],
      [
        routes.feature?.PATCH,
        request("PATCH", "/api/plan/features/x", { name: "a" }, ""),
        withId("x"),
      ],
      [
        routes.feature?.DELETE,
        request("DELETE", "/api/plan/features/x", undefined, ""),
        withId("x"),
      ],
      [
        routes.subList?.GET,
        request("GET", "/api/plan/subfeatures/list?planId=x", undefined, ""),
        noParams,
      ],
      [
        routes.subCreate?.POST,
        request(
          "POST",
          "/api/plan/subfeatures/create",
          { featureId: "x", name: "a" },
          "",
        ),
        noParams,
      ],
      [
        routes.sub?.PATCH,
        request("PATCH", "/api/plan/subfeatures/x", { name: "a" }, ""),
        withId("x"),
      ],
      [
        routes.sub?.DELETE,
        request("DELETE", "/api/plan/subfeatures/x", undefined, ""),
        withId("x"),
      ],
    ];
    for (const [handler, req, ctx] of guarded) {
      expect((await call(handler, req, ctx)).status).toBe(401);
    }
  });

  it("POST generate → generating, polling → ready dengan bentuk seperti situs acuan", async () => {
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "Booking klinik" }),
    );
    planId = created.json.plan.id;

    const missing = await call(
      routes.generate?.GET,
      request("GET", "/api/plan/roadmap/generate"),
    );
    expect(missing.status).toBe(400);

    const start = await call(
      routes.generate?.POST,
      request("POST", "/api/plan/roadmap/generate", { planId }),
    );
    expect(start).toEqual({ status: 200, json: { status: "generating" } });

    const polling = await call(
      routes.generate?.GET,
      request("GET", `/api/plan/roadmap/generate?planId=${planId}`),
    );
    expect(polling.json.status).toBe("generating");

    await idle();
    const ready = await call(
      routes.generate?.GET,
      request("GET", `/api/plan/roadmap/generate?planId=${planId}`),
    );
    expect(ready.status).toBe(200);
    const state = roadmapStateSchema.parse(ready.json);
    expect(state.status).toBe("ready");
    expect(state.title).toBe("Booking klinik");

    // Kunci respons sama dengan contoh situs acuan (+ `job` milik Piard untuk progres).
    // Contoh respons tidak ikut repo publik; bagian ini hanya jalan bila foldernya ada.
    if (HAS_SAMPLES) {
      const sample = loadSample("roadmap-generate-ready.json");
      if (
        !isRecord(sample) ||
        !Array.isArray(sample.features) ||
        !Array.isArray(sample.subFeatures)
      )
        throw new Error("contoh tak terduga");
      expect(Object.keys(ready.json).sort()).toEqual(
        [...Object.keys(sample), "job"].sort(),
      );
      const keys = (value: unknown) => (isRecord(value) ? Object.keys(value).sort() : []);
      expect(keys(ready.json.features[0])).toEqual(keys(sample.features[0]));
      expect(keys(ready.json.subFeatures[0])).toEqual(keys(sample.subFeatures[0]));
    }

    featureId = state.features[0]?.id ?? "";
    subId = state.subFeatures.find((s) => s.parentId === featureId)?.id ?? "";
  }, 30_000);

  it("pengguna lain mendapat 404 untuk plan, fitur, dan sub-fitur", async () => {
    const checks: Array<[Handler | undefined, Request, typeof noParams]> = [
      [
        routes.generate?.GET,
        request(
          "GET",
          `/api/plan/roadmap/generate?planId=${planId}`,
          undefined,
          otherCookie,
        ),
        noParams,
      ],
      [
        routes.generate?.POST,
        request("POST", "/api/plan/roadmap/generate", { planId }, otherCookie),
        noParams,
      ],
      [
        routes.feature?.PATCH,
        request("PATCH", `/api/plan/features/${featureId}`, { name: "x" }, otherCookie),
        withId(featureId),
      ],
      [
        routes.sub?.DELETE,
        request("DELETE", `/api/plan/subfeatures/${subId}`, undefined, otherCookie),
        withId(subId),
      ],
    ];
    for (const [handler, req, ctx] of checks) {
      expect((await call(handler, req, ctx)).status).toBe(404);
    }
  });

  it("CRUD fitur dan sub-fitur", async () => {
    const list = await call(
      routes.featureList?.GET,
      request("GET", `/api/plan/features/list?planId=${planId}`),
    );
    const count = list.json.features.length;

    const invalid = await call(
      routes.feature?.PATCH,
      request("PATCH", `/api/plan/features/${featureId}`, { name: "   " }),
      withId(featureId),
    );
    expect(invalid.status).toBe(400);
    const empty = await call(
      routes.feature?.PATCH,
      request("PATCH", `/api/plan/features/${featureId}`, {}),
      withId(featureId),
    );
    expect(empty.status).toBe(400);

    const patched = await call(
      routes.feature?.PATCH,
      request("PATCH", `/api/plan/features/${featureId}`, {
        name: "Booking Cepat",
        phase: 2,
      }),
      withId(featureId),
    );
    expect(patched.json.feature).toMatchObject({ name: "Booking Cepat", phase: 2 });

    const created = await call(
      routes.featureCreate?.POST,
      request("POST", "/api/plan/features/create", { planId, name: "Loyalitas" }),
    );
    expect(created.json.feature).toMatchObject({ source: "user", position: count });

    const sub = await call(
      routes.subCreate?.POST,
      request("POST", "/api/plan/subfeatures/create", {
        featureId: created.json.feature.id,
        name: "Poin",
      }),
    );
    expect(sub.json.subFeature).toMatchObject({
      featureId: created.json.feature.id,
      parentId: created.json.feature.id,
    });

    const subs = await call(
      routes.subList?.GET,
      request(
        "GET",
        `/api/plan/subfeatures/list?planId=${planId}&featureId=${created.json.feature.id}`,
      ),
    );
    expect(subs.json.subFeatures).toHaveLength(1);

    const renamed = await call(
      routes.sub?.PATCH,
      request("PATCH", `/api/plan/subfeatures/${subId}`, { name: "Cari Dokter Cepat" }),
      withId(subId),
    );
    expect(renamed.json.subFeature.name).toBe("Cari Dokter Cepat");

    expect(
      (
        await call(
          routes.sub?.DELETE,
          request("DELETE", `/api/plan/subfeatures/${subId}`),
          withId(subId),
        )
      ).json,
    ).toEqual({ ok: true });
    const removed = await call(
      routes.feature?.DELETE,
      request("DELETE", `/api/plan/features/${created.json.feature.id}`),
      withId(created.json.feature.id),
    );
    expect(removed.status).toBe(200);
    const again = await call(
      routes.feature?.DELETE,
      request("DELETE", `/api/plan/features/${created.json.feature.id}`),
      withId(created.json.feature.id),
    );
    expect(again.status).toBe(404);
  });

  it("edit ditolak dengan 409 selama roadmap dibuat ulang", async () => {
    const start = await call(
      routes.generate?.POST,
      request("POST", "/api/plan/roadmap/generate", { planId, regenerate: true }),
    );
    expect(start.json.status).toBe("generating");
    const conflict = await call(
      routes.featureCreate?.POST,
      request("POST", "/api/plan/features/create", { planId, name: "Saat job" }),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.json.code).toBe("CONFLICT");
    await idle();
  }, 30_000);
});
