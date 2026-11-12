import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { planSchema } from "@/features/plans";
import { HAS_SAMPLES, loadSample } from "../helpers/api-samples";

/** Kontrak HTTP plans memakai route handler sungguhan dan database in-memory. */

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

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  const { getDb, runMigrations } = await import("@/server/db/client");
  runMigrations(getDb());
  routes = {
    create: await import("@/app/api/plan/create/route"),
    list: await import("@/app/api/plan/list/route"),
    item: await import("@/app/api/plan/[id]/route"),
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
  it("semua endpoint plan menolak permintaan tanpa sesi", async () => {
    const guarded: Array<[Handler | undefined, Request, typeof noParams]> = [
      [
        routes.create?.POST,
        request("POST", "/api/plan/create", { idea: "x" }, ""),
        noParams,
      ],
      [routes.list?.GET, request("GET", "/api/plan/list", undefined, ""), noParams],
      [routes.item?.GET, request("GET", "/api/plan/abc", undefined, ""), withId("abc")],
      [
        routes.item?.PATCH,
        request("PATCH", "/api/plan/abc", { step: 3 }, ""),
        withId("abc"),
      ],
      [
        routes.item?.DELETE,
        request("DELETE", "/api/plan/abc", undefined, ""),
        withId("abc"),
      ],
    ];
    for (const [handler, req, ctx] of guarded) {
      expect((await call(handler, req, ctx)).status).toBe(401);
    }
  });
});

describe("POST /api/plan/create", () => {
  it("menolak ide kosong dan bahasa tak dikenal", async () => {
    const empty = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "   " }),
    );
    expect(empty.status).toBe(400);
    expect(empty.json.issues[0]).toMatchObject({
      path: "idea",
      message: "Tulis idenya dulu.",
    });

    const language = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "x", language: "fr" }),
    );
    expect(language.status).toBe(400);
  });

  it("membuat plan dengan bahasa bawaan id dan bentuk yang cocok dengan kontrak", async () => {
    const res = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "  Aplikasi booking klinik  " }),
    );
    expect(res.status).toBe(200);
    const plan = planSchema.parse(res.json.plan);
    expect(plan).toMatchObject({
      idea: "Aplikasi booking klinik",
      language: "id",
      step: 2,
      status: "draft",
    });
  });
});

describe("alur plan penuh", () => {
  let id = "";

  it("create → get → patch → list → delete", async () => {
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", {
        idea: "Tracker pengeluaran",
        language: "en",
      }),
    );
    id = created.json.plan.id;

    const got = await call(
      routes.item?.GET,
      request("GET", `/api/plan/${id}`),
      withId(id),
    );
    expect(got.status).toBe(200);
    expect(Object.keys(got.json).sort()).toEqual([
      "attachments",
      "chatMessages",
      "documents",
      "plan",
    ]);
    expect(got.json.plan.language).toBe("en");

    const patched = await call(
      routes.item?.PATCH,
      request("PATCH", `/api/plan/${id}`, {
        techStack: { backend: "Laravel" },
        extras: ["Auth"],
        step: 3,
      }),
      withId(id),
    );
    expect(patched).toEqual({ status: 200, json: { ok: true } });

    const after = await call(
      routes.item?.GET,
      request("GET", `/api/plan/${id}`),
      withId(id),
    );
    expect(after.json.plan).toMatchObject({
      step: 3,
      extras: ["Auth"],
      techStack: { backend: "Laravel", database: "ai-pilih" },
    });

    const list = await call(routes.list?.GET, request("GET", "/api/plan/list"));
    expect(list.json.plans.map((p: { id: string }) => p.id)).toContain(id);

    const deleted = await call(
      routes.item?.DELETE,
      request("DELETE", `/api/plan/${id}`),
      withId(id),
    );
    expect(deleted).toEqual({ status: 200, json: { ok: true } });
    const gone = await call(
      routes.item?.GET,
      request("GET", `/api/plan/${id}`),
      withId(id),
    );
    expect(gone.status).toBe(404);
  });

  it("PATCH menolak badan kosong dan nilai di luar rentang, tetapi mengabaikan field asing", async () => {
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "x" }),
    );
    const planId = created.json.plan.id;
    const patch = (body: unknown) =>
      call(
        routes.item?.PATCH,
        request("PATCH", `/api/plan/${planId}`, body),
        withId(planId),
      );

    expect((await patch({})).status).toBe(400);
    expect((await patch({ step: 9 })).status).toBe(400);
    expect((await patch({ step: 0 })).status).toBe(400);
    expect((await patch({ extras: [""] })).status).toBe(400);
    // Field milik situs acuan yang tidak disimpan Piard diabaikan, bukan galat.
    expect((await patch({ experience: null, budget: null, step: 3 })).status).toBe(200);
  });

  it("plan pengguna lain menjawab 404 (bukan 403) agar keberadaannya tidak bocor", async () => {
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "pribadi" }),
    );
    const planId = created.json.plan.id;
    expect(
      (
        await call(
          routes.item?.GET,
          request("GET", `/api/plan/${planId}`, undefined, otherCookie),
          withId(planId),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          routes.item?.PATCH,
          request("PATCH", `/api/plan/${planId}`, { step: 3 }, otherCookie),
          withId(planId),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          routes.item?.DELETE,
          request("DELETE", `/api/plan/${planId}`, undefined, otherCookie),
          withId(planId),
        )
      ).status,
    ).toBe(404);
    const list = await call(
      routes.list?.GET,
      request("GET", "/api/plan/list", undefined, otherCookie),
    );
    expect(list.json.plans).toEqual([]);
  });
});

describe.skipIf(!HAS_SAMPLES)("kontrak dengan contoh situs acuan", () => {
  /**
   * Field yang hanya ada di Piard (tidak ada padanannya di situs asli). Setiap entri butuh alasan;
   * field baru lain tetap membuat tes di bawah gagal.
   */
  const PLAN_FIELDS_PIARD_ONLY: Record<string, string> = {
    codebaseId:
      "proyek eksisting asal plan fitur baru (M7-18); situs asli punya `isCodebaseBaseline`, konsep lain",
    agentInstructions:
      "instruksi proyek untuk agen coding (M8-12, ADR 0017); jembatan agen tidak ada di situs asli",
  };

  it("contoh plan asli lolos planSchema (field kita adalah himpunan bagian dari miliknya)", () => {
    const sample = loadSample("plan-get-after-roadmap.json") as { plan: unknown };
    const shared = planSchema.omit({ codebaseId: true, agentInstructions: true });
    expect(Object.keys(PLAN_FIELDS_PIARD_ONLY)).toEqual([
      "codebaseId",
      "agentInstructions",
    ]);
    expect(shared.safeParse(sample.plan).success).toBe(true);
  });

  it("setiap field respons plan kita ada di contoh asli", async () => {
    const sample = loadSample("plan-get-after-roadmap.json") as {
      plan: Record<string, unknown>;
    };
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "kontrak" }),
    );
    const extra = Object.keys(created.json.plan).filter(
      (key) => !(key in sample.plan) && !(key in PLAN_FIELDS_PIARD_ONLY),
    );
    expect(extra).toEqual([]);
    // Field khusus Piard selalu ada di respons (null untuk plan biasa), bukan kadang-kadang.
    expect(created.json.plan.codebaseId).toBeNull();
    expect(created.json.plan.agentInstructions).toBeNull();
  });

  it("GET /api/plan/:id punya empat kunci teratas yang sama dengan contoh asli", () => {
    const sample = loadSample("plan-get-after-roadmap.json") as Record<string, unknown>;
    expect(Object.keys(sample).sort()).toEqual([
      "attachments",
      "chatMessages",
      "documents",
      "plan",
    ]);
  });

  it("GET /api/plan/:id plan fitur baru (M7-18): bentuk sama, codebaseId hanya tambahan", async () => {
    const sample = loadSample("plan-get-after-roadmap.json") as {
      plan: Record<string, unknown>;
    };
    const codebaseCreate = await import("@/app/api/codebase/create/route");
    const codebase = await codebaseCreate.POST(
      request("POST", "/api/codebase/create", { name: "Toko", source: "agent" }),
      noParams,
    );
    const codebaseId = ((await codebase.json()) as { codebase: { id: string } }).codebase
      .id;
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "Tambah kupon", codebaseId }),
    );
    expect(created.status).toBe(200);
    const id = created.json.plan.id as string;

    const plain = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", { idea: "Plan biasa" }),
    );
    const [withCodebase, without] = await Promise.all(
      [id, plain.json.plan.id as string].map((planId) =>
        call(routes.item?.GET, request("GET", `/api/plan/${planId}`), withId(planId)),
      ),
    );
    for (const got of [withCodebase, without]) {
      expect(got?.status).toBe(200);
      expect(Object.keys(got?.json).sort()).toEqual([
        "attachments",
        "chatMessages",
        "documents",
        "plan",
      ]);
      expect(planSchema.safeParse(got?.json.plan).success).toBe(true);
      const extra = Object.keys(got?.json.plan).filter(
        (key) => !(key in sample.plan) && !(key in PLAN_FIELDS_PIARD_ONLY),
      );
      expect(extra).toEqual([]);
    }
    expect(withCodebase?.json.plan.codebaseId).toBe(codebaseId);
    expect(without?.json.plan.codebaseId).toBeNull();
    expect(Object.keys(withCodebase?.json.plan).sort()).toEqual(
      Object.keys(without?.json.plan).sort(),
    );
  });
});
