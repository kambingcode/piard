import { beforeAll, describe, expect, it } from "vitest";
import type { SettingsView } from "@/features/settings";

/** Kontrak HTTP /api/settings memakai route handler sungguhan dan database in-memory (LLM_MODE=mock). */

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

let route: Partial<Record<"GET" | "PUT" | "DELETE", Handler>>;
let cookie = "";

const url = (path: string) => `http://localhost:3000${path}`;
const noParams = { params: Promise.resolve({}) };

async function call(method: "GET" | "PUT" | "DELETE", body?: unknown, as = cookie) {
  const handler = route[method];
  if (!handler) throw new Error(`handler ${method} tidak ada`);
  const res = await handler(
    new Request(url("/api/settings"), {
      method,
      headers: { "content-type": "application/json", cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    noParams,
  );
  return { status: res.status, json: await res.json() };
}

const models = {
  questions: "mock/questions",
  roadmap: "mock/roadmap",
  prd: "mock/prd",
  spec: "mock/spec",
  tasks: "mock/tasks",
  chat: "mock/chat",
  codebase: "mock/codebase",
};

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  const { getDb, runMigrations } = await import("@/server/db/client");
  runMigrations(getDb());
  route = await import("@/app/api/settings/route");
  const signUp = await import("@/app/api/auth/sign-up/route");
  const res = await signUp.POST(
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
  cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
});

describe("/api/settings", () => {
  it("menolak tanpa sesi", async () => {
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      expect((await call(method, undefined, "")).status).toBe(401);
    }
  });

  it("GET memberi pengaturan yang berlaku tanpa nilai kunci", async () => {
    const { status, json } = await call("GET");
    expect(status).toBe(200);
    const view = json as SettingsView;
    expect(view.mode).toBe("mock");
    expect(view.models.prd).toEqual({
      value: "mock/prd",
      envValue: "mock/prd",
      overridden: false,
    });
    expect(Object.values(view.keys).every((v) => typeof v === "boolean")).toBe(true);
  });

  it("PUT menyimpan, GET berikutnya membaca nilai baru, DELETE mengembalikan .env", async () => {
    const saved = await call("PUT", {
      models: { ...models, roadmap: "vendor/roadmap-baru" },
      budget: { dailyUsd: 0.5, monthlyUsd: null },
    });
    expect(saved.status).toBe(200);
    expect(saved.json.models.roadmap).toMatchObject({
      value: "vendor/roadmap-baru",
      overridden: true,
    });

    const read = await call("GET");
    expect(read.json.budget.dailyUsd).toMatchObject({ value: 0.5, overridden: true });

    const reset = await call("DELETE");
    expect(reset.json.models.roadmap).toMatchObject({
      value: "mock/roadmap",
      overridden: false,
    });
  });

  it("PUT menolak isi tidak valid dengan galat per kolom", async () => {
    const { status, json } = await call("PUT", {
      models: { ...models, prd: "bukan model!" },
      budget: { dailyUsd: -1, monthlyUsd: null },
    });
    expect(status).toBe(400);
    expect(json.code).toBe("VALIDATION");
    const paths = (json.issues as { path: string }[]).map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(["models.prd", "budget.dailyUsd"]));
  });
});
