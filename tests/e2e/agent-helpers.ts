import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "./fixtures";

async function poll(page: Page, path: string, key: string, value: string) {
  await expect
    .poll(async () => (await (await page.request.get(path)).json())[key], {
      timeout: 60_000,
    })
    .toBe(value);
}

/** Plan berisi 21 task (mode mock) lewat API, siap dibuka di kanban. */
export async function boardWithTasks(page: Page, idea: string): Promise<string> {
  const created = await (
    await page.request.post("/api/plan/create", { data: { idea } })
  ).json();
  const id: string = created.plan.id;
  await page.request.post("/api/plan/questions", { data: { planId: id } });
  await page.request.patch(`/api/plan/${id}`, { data: { step: 4 } });
  await page.request.post("/api/plan/roadmap/generate", { data: { planId: id } });
  await poll(page, `/api/plan/roadmap/generate?planId=${id}`, "status", "ready");
  await page.request.post("/api/plan/generate", { data: { planId: id } });
  await poll(page, `/api/plan/generate?planId=${id}`, "status", "ready");
  await page.request.post("/api/plan/generation/start", { data: { planId: id } });
  await poll(page, `/api/plan/generation/status?planId=${id}`, "status", "ready");
  return id;
}

/** Token agen plan lewat API pengguna (sesi halaman). */
export async function createAgentToken(page: Page, planId: string, label = "Laptop uji") {
  const res = await page.request.post("/api/plan/agent-tokens", {
    data: { planId, label },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).token as string;
}

type AgentBody = {
  task: { id: string; title: string };
  instructions: string | null;
  error?: string;
};

/** Agen tersimulasi: panggilan `/api/agent/*` dengan Bearer, tanpa cookie halaman. */
export function agent(request: APIRequestContext, token: string) {
  const headers = { authorization: `Bearer ${token}` };
  const json = async (res: Awaited<ReturnType<APIRequestContext["get"]>>) => ({
    status: res.status(),
    // Bentuk badan dijamin kontrak `/api/agent/*` (docs/api.md); tes hanya membaca field ini.
    body: (await res.json()) as AgentBody,
  });
  return {
    next: async () => json(await request.get("/api/agent/tasks/next", { headers })),
    plan: async () => json(await request.get("/api/agent/plan", { headers })),
    claim: async (id: string) =>
      json(await request.post(`/api/agent/tasks/${id}/claim`, { headers })),
    note: async (id: string, body: string, kind: "note" | "question" = "note") =>
      json(
        await request.post(`/api/agent/tasks/${id}/notes`, {
          headers,
          data: { kind, body },
        }),
      ),
    report: async (id: string, summary: string) =>
      json(
        await request.post(`/api/agent/tasks/${id}/report`, {
          headers,
          data: {
            summary,
            verification: "pnpm test: semua lulus",
            filesChanged: ["src/a.ts"],
          },
        }),
      ),
    getTask: async (id: string) =>
      json(await request.get(`/api/agent/tasks/${id}`, { headers })),
  };
}
