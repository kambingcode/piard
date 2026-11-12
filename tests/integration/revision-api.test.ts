import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { chatMessageSchema, syncStatusSchema } from "@/features/revision";

/** Kontrak HTTP chat revisi dan sinkronisasi: route handler sungguhan, job runner proses, LLM mock. */

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
  const { specsJobHandlers } = await import("@/features/specs/server");
  const { revisionJobHandlers } = await import("@/features/revision/server");
  const runner = startJobRunner({
    ...roadmapJobHandlers,
    ...prdJobHandlers,
    ...specsJobHandlers,
    ...revisionJobHandlers,
  });
  idle = () => runner.idle();

  routes = {
    signUp: await import("@/app/api/auth/sign-up/route"),
    create: await import("@/app/api/plan/create/route"),
    roadmap: await import("@/app/api/plan/roadmap/generate/route"),
    prd: await import("@/app/api/plan/generate/route"),
    save: await import("@/app/api/plan/save-document/route"),
    chat: await import("@/app/api/plan/chat/route"),
    revise: await import("@/app/api/plan/revise/route"),
    status: await import("@/app/api/plan/sync/status/route"),
    features: await import("@/app/api/plan/sync/features/route"),
    apply: await import("@/app/api/plan/sync/apply/route"),
    reject: await import("@/app/api/plan/sync/reject/route"),
    dismiss: await import("@/app/api/plan/sync/dismiss/route"),
    syncTasks: await import("@/app/api/plan/sync/tasks/route"),
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

async function stream(req: Request) {
  const res = await routes.chat?.POST?.(req, noParams);
  if (!res) throw new Error("handler tidak ada");
  const text = await res.text();
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    lines: res.ok
      ? text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [],
    json: res.ok ? undefined : JSON.parse(text),
  };
}

describe("chat revisi lewat HTTP", () => {
  let planId = "";

  beforeAll(async () => {
    const created = await call(
      routes.create?.POST,
      request("POST", "/api/plan/create", {
        idea: "Aplikasi katering harian",
        language: "id",
      }),
    );
    planId = created.json.plan.id;
    await call(
      routes.roadmap?.POST,
      request("POST", "/api/plan/roadmap/generate", { planId }),
    );
    await idle();
    await call(routes.prd?.POST, request("POST", "/api/plan/generate", { planId }));
    await idle();
  });

  it("menolak tanpa sesi (401), pesan kosong (400), dan plan orang lain (404)", async () => {
    expect(
      (await stream(request("POST", "/api/plan/chat", { planId, text: "x" }, ""))).status,
    ).toBe(401);
    const empty = await stream(request("POST", "/api/plan/chat", { planId, text: "  " }));
    expect(empty.status).toBe(400);
    expect(empty.json.code).toBe("VALIDATION");
    const other = await stream(
      request("POST", "/api/plan/chat", { planId, text: "x" }, otherCookie),
    );
    expect(other.status).toBe(404);
    expect(
      (
        await call(
          routes.status?.GET,
          request(
            "GET",
            `/api/plan/sync/status?planId=${planId}`,
            undefined,
            otherCookie,
          ),
        )
      ).status,
    ).toBe(404);
  });

  it("POST mengalirkan NDJSON user → text → part → done; GET mengembalikan riwayat", async () => {
    const res = await stream(
      request("POST", "/api/plan/chat", {
        planId,
        text: "Tambahkan fitur notifikasi pengingat",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.type).toContain("application/x-ndjson");
    const types = res.lines.map((line: { type: string }) => line.type);
    expect(types[0]).toBe("user");
    expect(types.at(-1)).toBe("done");
    expect(types.filter((t: string) => t === "part")).toHaveLength(2);
    await idle();

    const history = await call(
      routes.chat?.GET,
      request("GET", `/api/plan/chat?planId=${planId}`),
    );
    expect(history.status).toBe(200);
    for (const message of history.json.messages) chatMessageSchema.parse(message);
    expect(history.json.messages[1].parts[1]).toMatchObject({
      status: "done",
      version: 2,
    });
  });

  it("status, terima usulan, sesuaikan task, lalu penyesuaian fitur dan abaikan", async () => {
    const status = await call(
      routes.status?.GET,
      request("GET", `/api/plan/sync/status?planId=${planId}`),
    );
    const sync = syncStatusSchema.parse(status.json);
    expect(sync.prd.dirty).toBe(true);
    const proposalId = sync.pending[0]?.id;

    expect(
      (
        await call(
          routes.apply?.POST,
          request("POST", "/api/plan/sync/apply", { proposalId }, otherCookie),
        )
      ).status,
    ).toBe(404);
    const applied = await call(
      routes.apply?.POST,
      request("POST", "/api/plan/sync/apply", { proposalId }),
    );
    expect(applied.status).toBe(200);
    expect(applied.json.changed).toBe(1);
    expect(
      (
        await call(
          routes.reject?.POST,
          request("POST", "/api/plan/sync/reject", { proposalId }),
        )
      ).status,
    ).toBe(409);

    const tasks = await call(
      routes.syncTasks?.POST,
      request("POST", "/api/plan/sync/tasks", { planId }),
    );
    expect(tasks.json.status).toBe("generating");
    await idle();

    const reconcile = await call(
      routes.features?.POST,
      request("POST", "/api/plan/sync/features", { planId }),
    );
    expect(reconcile.status).toBe(200);
    await idle();
    const dismissed = await call(
      routes.dismiss?.POST,
      request("POST", "/api/plan/sync/dismiss", { planId }),
    );
    expect(syncStatusSchema.parse(dismissed.json)).toMatchObject({
      prd: { dirty: false },
      staleFeatureIds: [],
    });
  });

  it("POST /revise memulai revisi; tanpa permintaan mengulang yang terakhir", async () => {
    const started = await call(
      routes.revise?.POST,
      request("POST", "/api/plan/revise", {
        planId,
        instructions: "Tambahkan audit log",
      }),
    );
    expect(started.json).toMatchObject({ status: "generating", fromVersion: 2 });
    const busy = await call(
      routes.revise?.POST,
      request("POST", "/api/plan/revise", { planId }),
    );
    expect(busy.status).toBe(409);
    await idle();
    const prd = await call(
      routes.prd?.GET,
      request("GET", `/api/plan/generate?planId=${planId}`),
    );
    expect(prd.json).toMatchObject({
      status: "ready",
      document: { version: 3 },
      job: { kind: "revise" },
    });
  });
});
