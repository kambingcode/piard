import { createHash, randomBytes } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * M7-13: progres analisis lewat route sungguhan. `GET .../status` dan SSE `GET .../stream` (event
 * `status`, bentuk sama dengan status) mengikuti job `codebase-analyze` mode mock sampai selesai.
 */

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;
type Routes = Record<string, Partial<Record<"GET" | "POST" | "DELETE", Handler>>>;
type Status = {
  status: string;
  error: string | null;
  job: { id: string; state: string; phase: string; done: number; total: number } | null;
};

let routes: Routes;
let cookie = "";
let otherCookie = "";
let idle: () => Promise<void>;

const url = (path: string) => `http://localhost:3000${path}`;
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

function request(
  method: string,
  path: string,
  body?: BodyInit,
  as = cookie,
  signal?: AbortSignal,
) {
  return new Request(url(path), {
    method,
    headers: { "content-type": "application/json", cookie: as },
    body,
    signal,
    duplex: "half",
  } as RequestInit);
}

async function call(handler: Handler | undefined, req: Request, id: string) {
  if (!handler) throw new Error("handler tidak ada");
  const res = await handler(req, withId(id));
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

/** Membaca event SSE sampai `until` terpenuhi, lalu memutus koneksi. */
async function readStatuses(id: string, until: (events: Status[]) => boolean) {
  const handler = routes.stream?.GET;
  if (!handler) throw new Error("handler tidak ada");
  const controller = new AbortController();
  const res = await handler(
    request("GET", `/api/codebase/${id}/stream`, undefined, cookie, controller.signal),
    withId(id),
  );
  const reader = res.body?.getReader();
  if (!reader) throw new Error("tanpa body");
  const decoder = new TextDecoder();
  const events: Status[] = [];
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
      if (event === "status" && data) events.push(JSON.parse(data));
    }
  }
  controller.abort();
  return { res, events };
}

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.LLM_MODE = "mock";
  const { getDb, runMigrations } = await import("@/server/db/client");
  runMigrations(getDb());
  const { startJobRunner } = await import("@/server/jobs");
  const { codebaseJobHandlers } = await import("@/features/codebase/server");
  const runner = startJobRunner(codebaseJobHandlers);
  idle = () => runner.idle();

  routes = {
    signUp: await import("@/app/api/auth/sign-up/route"),
    create: await import("@/app/api/codebase/create/route"),
    item: await import("@/app/api/codebase/[id]/route"),
    upload: await import("@/app/api/codebase/[id]/upload/route"),
    analyze: await import("@/app/api/codebase/[id]/analyze/route"),
    status: await import("@/app/api/codebase/[id]/status/route"),
    stream: await import("@/app/api/codebase/[id]/stream/route"),
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
    withId(""),
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

async function zipCodebase() {
  const created = await call(
    routes.create?.POST,
    request(
      "POST",
      "/api/codebase/create",
      JSON.stringify({ name: "Toko", source: "zip" }),
    ),
    "",
  );
  const id = created.json.codebase.id as string;
  const zip = zipSync({
    "toko/README.md": strToU8("# Toko\nAplikasi toko daring."),
    "toko/package.json": strToU8(JSON.stringify({ dependencies: { next: "16" } })),
    "toko/src/app/page.tsx": strToU8("export default function Page() { return null }"),
  });
  const res = await call(
    routes.upload?.POST,
    new Request(url(`/api/codebase/${id}/upload`), {
      method: "POST",
      headers: { "content-type": "application/zip", cookie },
      body: zip,
      duplex: "half",
    } as RequestInit),
    id,
  );
  expect(res.status).toBe(200);
  return id;
}

describe("status dan SSE analisis", () => {
  it("status tanpa job; milik orang lain 404 untuk status dan stream", async () => {
    const id = await zipCodebase();
    const status = await call(
      routes.status?.GET,
      request("GET", `/api/codebase/${id}/status`),
      id,
    );
    expect(status).toEqual({
      status: 200,
      json: { status: "source_ready", error: null, job: null },
    });

    for (const route of [routes.status, routes.stream]) {
      const res = await call(
        route?.GET,
        request("GET", `/api/codebase/${id}/stream`, undefined, otherCookie),
        id,
      );
      expect(res.status).toBe(404);
    }
    await call(routes.item?.DELETE, request("DELETE", `/api/codebase/${id}`), id);
  });

  it("stream mengirim status segera, lalu tiap fase sampai ready; status route sama", async () => {
    const id = await zipCodebase();
    const streamed = readStatuses(
      id,
      (events) => events.at(-1)?.job?.state === "succeeded",
    );
    const started = await call(
      routes.analyze?.POST,
      request(
        "POST",
        `/api/codebase/${id}/analyze`,
        JSON.stringify({ confirmed: false }),
      ),
      id,
    );
    expect(started.json.started).toBe(true);

    const { res, events } = await streamed;
    await idle();
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(events[0]).toEqual({ status: "source_ready", error: null, job: null });

    const phases = events.flatMap((e) => (e.job ? [e.job.phase] : []));
    // Urutan fase yang dipakai UI: Membaca repo → Meringkas → Menyusun dokumentasi → selesai.
    const order = ["profile", "summarize", "pages", "done"];
    expect([...new Set(phases)]).toEqual(order.filter((p) => phases.includes(p)));
    expect(phases).toContain("pages");
    const last = events.at(-1);
    expect(last).toMatchObject({
      status: "ready",
      error: null,
      job: { state: "succeeded", phase: "done", done: 10, total: 10 },
    });

    const status = await call(
      routes.status?.GET,
      request("GET", `/api/codebase/${id}/status`),
      id,
    );
    expect(status.json).toEqual(last);
    await call(routes.item?.DELETE, request("DELETE", `/api/codebase/${id}`), id);
  });
});
