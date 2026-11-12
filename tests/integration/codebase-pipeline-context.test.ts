import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * M7-19: dokumentasi proyek sampai ke prompt kelima tugas (pertanyaan, roadmap, PRD, spesifikasi, task)
 * lewat route dan instance sungguhan. Tes prompt di `tests/unit/codebase-context-prompts.test.ts` hanya
 * menguji pembuat prompt; tes ini menangkap wiring yang terlewat (bawaan service `codebaseContext` = "").
 */

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;
type Routes = Record<string, Partial<Record<"GET" | "POST", Handler>>>;
type Captured = { task: string; text: string };

let routes: Routes;
let cookie = "";
let idle: () => Promise<void>;
let captured: Captured[] = [];

const url = (path: string) => `http://localhost:3000${path}`;
const noParams = { params: Promise.resolve({}) };
const MARKER = "src/features/keranjang/repo.ts";

function request(method: string, path: string, body?: unknown) {
  return new Request(url(path), {
    method,
    headers: { "content-type": "application/json", cookie },
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
  const runner = startJobRunner({
    ...roadmapJobHandlers,
    ...prdJobHandlers,
    ...specsJobHandlers,
  });
  idle = () => runner.idle();

  routes = {
    signUp: await import("@/app/api/auth/sign-up/route"),
    codebase: await import("@/app/api/codebase/create/route"),
    create: await import("@/app/api/plan/create/route"),
    questions: await import("@/app/api/plan/questions/route"),
    roadmap: await import("@/app/api/plan/roadmap/generate/route"),
    prd: await import("@/app/api/plan/generate/route"),
    start: await import("@/app/api/plan/generation/start/route"),
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
}, 30_000);

/** Menyadap prompt dari klien AI bersama (objek yang sama dipegang semua instance service). */
async function capturePrompts() {
  const { getAi } = await import("@/server/ai");
  const ai = getAi();
  const keep = (args: { task: string; prompt?: string; messages?: unknown }) => {
    captured.push({
      task: args.task,
      text: args.prompt ?? JSON.stringify(args.messages ?? ""),
    });
  };
  for (const method of [
    "generateStructured",
    "streamStructured",
    "streamText",
  ] as const) {
    const original = ai[method].bind(ai) as (args: never) => unknown;
    vi.spyOn(ai, method).mockImplementation(((args: never) => {
      keep(args);
      return original(args);
    }) as never);
  }
}

/** Plan lewat semua langkah pipeline: pertanyaan → roadmap → PRD → spesifikasi + task. */
async function runPipeline(codebaseId?: string) {
  captured = [];
  const created = await call(
    routes.create?.POST,
    request("POST", "/api/plan/create", { idea: "Tambah wishlist", codebaseId }),
  );
  expect(created.status).toBe(200);
  const planId = created.json.plan.id as string;
  for (const [route, path] of [
    [routes.questions, "/api/plan/questions"],
    [routes.roadmap, "/api/plan/roadmap/generate"],
    [routes.prd, "/api/plan/generate"],
    [routes.start, "/api/plan/generation/start"],
  ] as const) {
    const res = await call(route?.POST, request("POST", path, { planId }));
    expect(res.status, path).toBe(200);
    await idle();
  }
  return captured;
}

describe("konteks codebase di pipeline plan (M7-19)", () => {
  it(
    "kelima tugas menerima dokumentasi proyek; plan biasa tidak sama sekali",
    { timeout: 60_000 },
    async () => {
      await capturePrompts();
      const res = await routes.codebase?.POST?.(
        request("POST", "/api/codebase/create", { name: "Toko", source: "agent" }),
        noParams,
      );
      const codebaseId = ((await res?.json()) as { codebase: { id: string } }).codebase
        .id;
      const { getCodebaseRepo } = await import("@/features/codebase/server/repo");
      getCodebaseRepo().addDocVersions(codebaseId, [
        {
          slug: "modul",
          title: "Modul",
          content: `Keranjang belanja ada di \`${MARKER}\`.`,
          origin: "agent",
        },
      ]);

      const withContext = await runPipeline(codebaseId);
      const tasks = ["questions", "roadmap", "prd", "spec", "tasks"];
      expect([...new Set(withContext.map((c) => c.task))].sort()).toEqual(
        [...tasks].sort(),
      );
      for (const task of tasks) {
        const prompts = withContext.filter((c) => c.task === task);
        for (const prompt of prompts) {
          expect(prompt.text, task).toContain("<codebase_docs");
          expect(prompt.text, task).toContain(MARKER);
        }
      }

      const plain = await runPipeline();
      expect([...new Set(plain.map((c) => c.task))].sort()).toEqual([...tasks].sort());
      for (const prompt of plain) {
        expect(prompt.text, prompt.task).not.toContain("codebase_docs");
        expect(prompt.text, prompt.task).not.toContain(MARKER);
      }
    },
  );
});
