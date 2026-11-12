import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildStateSchema } from "@/features/specs";
import { taskSchema } from "@/features/tasks";

/** Kontrak HTTP spesifikasi, task, dan SSE memakai route handler sungguhan dan LLM mock. */

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
let planId = "";
let featureIds: string[] = [];

const url = (path: string) => `http://localhost:3000${path}`;
const noParams = { params: Promise.resolve({}) };
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

function request(
  method: string,
  path: string,
  body?: unknown,
  as = cookie,
  signal?: AbortSignal,
) {
  return new Request(url(path), {
    method,
    headers: { "content-type": "application/json", cookie: as },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
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
  const { prdJobHandlers } = await import("@/features/prd/server");
  const { specsJobHandlers } = await import("@/features/specs/server");
  const runner = startJobRunner({
    ...roadmapJobHandlers,
    ...prdJobHandlers,
    ...specsJobHandlers,
  });
  idle = () => runner.idle();

  routes = {
    signUp: await import("@/app/api/auth/sign-up/route"),
    create: await import("@/app/api/plan/create/route"),
    roadmap: await import("@/app/api/plan/roadmap/generate/route"),
    prd: await import("@/app/api/plan/generate/route"),
    features: await import("@/app/api/plan/features/list/route"),
    start: await import("@/app/api/plan/generation/start/route"),
    status: await import("@/app/api/plan/generation/status/route"),
    stream: await import("@/app/api/plan/generation/stream/route"),
    taskStream: await import("@/app/api/plan/tasks/stream/route"),
    taskList: await import("@/app/api/plan/tasks/list/route"),
    taskCreate: await import("@/app/api/plan/tasks/create/route"),
    task: await import("@/app/api/plan/tasks/[id]/route"),
    bulk: await import("@/app/api/plan/tasks/bulk-status/route"),
    reset: await import("@/app/api/plan/tasks/reset/route"),
    taskGenerate: await import("@/app/api/plan/tasks/generate/route"),
    exportFile: await import("@/app/api/plan/export/route"),
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

  const created = await call(
    routes.create?.POST,
    request("POST", "/api/plan/create", {
      idea: "Aplikasi katering harian",
      language: "id",
    }),
  );
  planId = created.json.plan.id;
}, 30_000);

/** Membaca event SSE sampai `until` terpenuhi, lalu memutus koneksi. */
async function readEvents(
  handler: Handler | undefined,
  path: string,
  until: (events: Array<{ event: string; data: Record<string, unknown> }>) => boolean,
) {
  if (!handler) throw new Error("handler tidak ada");
  const controller = new AbortController();
  const res = await handler(
    request("GET", path, undefined, cookie, controller.signal),
    noParams,
  );
  const reader = res.body?.getReader();
  if (!reader) throw new Error("tanpa body");
  const decoder = new TextDecoder();
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  let buffer = "";
  while (!until(events)) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = /^event: (.+)$/m.exec(part)?.[1];
      const data = /^data: (.+)$/m.exec(part)?.[1];
      if (event && data) events.push({ event, data: JSON.parse(data) });
    }
  }
  controller.abort();
  await reader.cancel().catch(() => undefined);
  return { res, events };
}

describe("spesifikasi lewat HTTP", () => {
  it("semua endpoint baru menolak tanpa sesi", async () => {
    const anon = [
      [routes.start?.POST, request("POST", "/api/plan/generation/start", { planId }, "")],
      [
        routes.status?.GET,
        request("GET", `/api/plan/generation/status?planId=${planId}`, undefined, ""),
      ],
      [
        routes.stream?.GET,
        request("GET", `/api/plan/generation/stream?planId=${planId}`, undefined, ""),
      ],
      [
        routes.taskList?.GET,
        request("GET", `/api/plan/tasks/list?planId=${planId}`, undefined, ""),
      ],
      [routes.reset?.POST, request("POST", "/api/plan/tasks/reset", { planId }, "")],
    ] as const;
    for (const [handler, req] of anon)
      expect((await call(handler, req)).status).toBe(401);
  });

  it("menolak sebelum PRD ada (409), lalu berhasil setelah roadmap dan PRD siap", async () => {
    await call(
      routes.roadmap?.POST,
      request("POST", "/api/plan/roadmap/generate", { planId }),
    );
    await idle();
    const early = await call(
      routes.start?.POST,
      request("POST", "/api/plan/generation/start", { planId }),
    );
    expect(early.status).toBe(409);

    await call(routes.prd?.POST, request("POST", "/api/plan/generate", { planId }));
    await idle();
    const features = await call(
      routes.features?.GET,
      request("GET", `/api/plan/features/list?planId=${planId}`),
    );
    featureIds = features.json.features.map((f: { id: string }) => f.id);

    // SSE dibuka lebih dulu agar progres job terlihat dari awal.
    const streamed = readEvents(
      routes.stream?.GET,
      `/api/plan/generation/stream?planId=${planId}`,
      (events) => events.some((e) => e.data.status === "done"),
    );
    const started = await call(
      routes.start?.POST,
      request("POST", "/api/plan/generation/start", { planId }),
    );
    expect(started.json).toEqual({ status: "generating" });
    const { res, events } = await streamed;
    await idle();

    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(events.every((e) => e.event === "job")).toBe(true);
    const last = events.at(-1)?.data;
    expect(last).toMatchObject({
      phase: "done",
      status: "done",
      totalFeatures: featureIds.length,
    });
    expect(last?.doneFeatures).toBe(featureIds.length);
    expect(events.some((e) => e.data.phase === "enrich")).toBe(true);

    const status = await call(
      routes.status?.GET,
      request("GET", `/api/plan/generation/status?planId=${planId}`),
    );
    expect(buildStateSchema.parse(status.json)).toMatchObject({ status: "ready" });
  });

  it("pengguna lain mendapat 404 pada status, start, dan stream", async () => {
    for (const [handler, req] of [
      [
        routes.status?.GET,
        request(
          "GET",
          `/api/plan/generation/status?planId=${planId}`,
          undefined,
          otherCookie,
        ),
      ],
      [
        routes.start?.POST,
        request("POST", "/api/plan/generation/start", { planId }, otherCookie),
      ],
      [
        routes.stream?.GET,
        request(
          "GET",
          `/api/plan/generation/stream?planId=${planId}`,
          undefined,
          otherCookie,
        ),
      ],
    ] as const) {
      expect((await call(handler, req)).status).toBe(404);
    }
  });
});

describe("task lewat HTTP", () => {
  it("daftar task tervalidasi skema, urut fitur lalu posisi", async () => {
    const res = await call(
      routes.taskList?.GET,
      request("GET", `/api/plan/tasks/list?planId=${planId}`),
    );
    const list = res.json.tasks.map((t: unknown) => taskSchema.parse(t));
    expect(list).toHaveLength(featureIds.length * 3);
    expect(list.map((t: { featureId: string }) => t.featureId).slice(0, 3)).toEqual([
      featureIds[0],
      featureIds[0],
      featureIds[0],
    ]);
    const one = await call(
      routes.taskList?.GET,
      request("GET", `/api/plan/tasks/list?planId=${planId}&featureId=${featureIds[1]}`),
    );
    expect(one.json.tasks).toHaveLength(3);
  });

  it("buat, ubah, hapus; validasi dan kepemilikan", async () => {
    const created = await call(
      routes.taskCreate?.POST,
      request("POST", "/api/plan/tasks/create", {
        featureId: featureIds[0],
        title: "Task saya",
      }),
    );
    expect(created.status).toBe(200);
    expect(created.json.task).toMatchObject({
      title: "Task saya",
      status: "todo",
      position: 3,
    });
    const id = created.json.task.id;

    const patched = await call(
      routes.task?.PATCH,
      request("PATCH", `/api/plan/tasks/${id}`, {
        status: "doing",
        prompt: "Kerjakan X",
      }),
      withId(id),
    );
    expect(patched.json.task).toMatchObject({ status: "doing", prompt: "Kerjakan X" });

    expect(
      (
        await call(
          routes.task?.PATCH,
          request("PATCH", `/api/plan/tasks/${id}`, {}),
          withId(id),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          routes.task?.PATCH,
          request("PATCH", `/api/plan/tasks/${id}`, { status: "doing" }, otherCookie),
          withId(id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          routes.taskCreate?.POST,
          request(
            "POST",
            "/api/plan/tasks/create",
            { featureId: featureIds[0], title: "x" },
            otherCookie,
          ),
        )
      ).status,
    ).toBe(404);

    expect(
      (
        await call(
          routes.task?.DELETE,
          request("DELETE", `/api/plan/tasks/${id}`),
          withId(id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          routes.task?.DELETE,
          request("DELETE", `/api/plan/tasks/${id}`),
          withId(id),
        )
      ).status,
    ).toBe(404);
  });

  it("task hanya untuk fitur utama, bukan sub-fitur", async () => {
    const { getDb } = await import("@/server/db/client");
    const { features } = await import("@/server/db/schema");
    const { isNotNull } = await import("drizzle-orm");
    const sub = getDb().select().from(features).where(isNotNull(features.parentId)).get();
    const res = await call(
      routes.taskCreate?.POST,
      request("POST", "/api/plan/tasks/create", { featureId: sub?.id, title: "x" }),
    );
    expect(res.status).toBe(400);
  });

  it("status massal dan reset; id plan lain diabaikan", async () => {
    const list = (
      await call(
        routes.taskList?.GET,
        request("GET", `/api/plan/tasks/list?planId=${planId}`),
      )
    ).json.tasks as Array<{ id: string }>;
    const ids = list.slice(0, 4).map((t) => t.id);
    const bulk = await call(
      routes.bulk?.PATCH,
      request("PATCH", "/api/plan/tasks/bulk-status", {
        planId,
        ids: [...ids, "bukan-id"],
        status: "done",
      }),
    );
    expect(bulk.json).toEqual({ updated: 4 });
    const after = (
      await call(
        routes.taskList?.GET,
        request("GET", `/api/plan/tasks/list?planId=${planId}`),
      )
    ).json.tasks as Array<{ id: string; status: string }>;
    expect(after.filter((t) => t.status === "done").map((t) => t.id)).toEqual(ids);

    const reset = await call(
      routes.reset?.POST,
      request("POST", "/api/plan/tasks/reset", { planId }),
    );
    expect(reset.json.updated).toBe(list.length);
    expect(
      (
        await call(
          routes.bulk?.PATCH,
          request("PATCH", "/api/plan/tasks/bulk-status", {
            planId,
            ids,
            status: "selesai",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          routes.bulk?.PATCH,
          request(
            "PATCH",
            "/api/plan/tasks/bulk-status",
            { planId, ids, status: "done" },
            otherCookie,
          ),
        )
      ).status,
    ).toBe(404);
  });

  it("generate task satu fitur mengirim event task lewat SSE", async () => {
    const featureId = featureIds[2] ?? "";
    const streamed = readEvents(
      routes.taskStream?.GET,
      `/api/plan/tasks/stream?planId=${planId}`,
      (events) =>
        events.some((e) => e.data.status === "done" && e.data.featureId === featureId),
    );
    const started = await call(
      routes.taskGenerate?.POST,
      request("POST", "/api/plan/tasks/generate", { featureId }),
    );
    expect(started.json).toEqual({ status: "generating" });
    const { events } = await streamed;
    await idle();
    expect(events.every((e) => e.event === "task")).toBe(true);
    expect(events.at(-1)?.data).toMatchObject({ status: "done", featureId });
  });
});

describe("ekspor ZIP lewat HTTP", () => {
  it("berisi PRD.md dan satu berkas per fitur dengan task dan prompt", async () => {
    const { strFromU8, unzipSync } = await import("fflate");
    const handler = routes.exportFile?.GET;
    if (!handler) throw new Error("handler tidak ada");
    const res = await handler(
      request("GET", `/api/plan/export?planId=${planId}&format=zip`),
      noParams,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="aplikasi-katering-harian\.zip"$/,
    );
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const names = Object.keys(files);
    expect(names[0]).toBe("PRD.md");
    // Plan tanpa proyek eksisting: struktur lama utuh, tanpa folder codebase/ (M7-20).
    expect(names.some((n) => n.startsWith("codebase/"))).toBe(false);
    expect(names.filter((n) => /^features\/\d{2}-[a-z0-9-]+\.md$/.test(n))).toHaveLength(
      featureIds.length,
    );
    const first = strFromU8(files[names[1] ?? ""] ?? new Uint8Array());
    expect(first).toMatch(/^# .+\n/);
    expect(first).toContain("## Spesifikasi\n\n### Tujuan");
    expect(first).toContain("## Sub-fitur: ");
    expect(first).toContain("## Task\n\n### 1. ");
    expect(first).toContain("**Prompt:**\n\n```\nKamu sedang mengerjakan produk");
  });

  it("format md tetap jalan; format lain 400; tanpa sesi 401; plan orang lain 404", async () => {
    const md = await routes.exportFile?.GET?.(
      request("GET", `/api/plan/export?planId=${planId}&format=md`),
      noParams,
    );
    expect(md?.status).toBe(200);
    expect(md?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(
      (
        await call(
          routes.exportFile?.GET,
          request("GET", `/api/plan/export?planId=${planId}&format=pdf`),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          routes.exportFile?.GET,
          request("GET", `/api/plan/export?planId=${planId}&format=zip`, undefined, ""),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          routes.exportFile?.GET,
          request(
            "GET",
            `/api/plan/export?planId=${planId}&format=zip`,
            undefined,
            otherCookie,
          ),
        )
      ).status,
    ).toBe(404);
  });
});
