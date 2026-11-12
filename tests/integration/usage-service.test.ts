import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUsageRepo, createUsageService } from "@/features/usage/server";
import type { BudgetStatus } from "@/server/ai";
import type { DbHandle } from "@/server/db/client";
import { plans, usage, workspaces } from "@/server/db/schema";
import { createTestDb, seedUser } from "../helpers/test-db";

const budget: BudgetStatus = {
  daily: { spentUsd: 0.5, limitUsd: null },
  monthly: { spentUsd: 2, limitUsd: 10 },
};

let handle: DbHandle;
let owner: string;
let planId: string;

beforeEach(() => {
  handle = createTestDb();
  owner = seedUser(handle.db).id;
  planId = seedPlan(owner);
});
afterEach(() => handle.close());

function seedPlan(userId: string): string {
  const ws = handle.db.insert(workspaces).values({ userId, name: "W" }).returning().get();
  return handle.db
    .insert(plans)
    .values({ userId, workspaceId: ws.id, idea: "i" })
    .returning()
    .get().id;
}

function record(values: {
  kind: string;
  refId?: string;
  model?: string;
  costUsd: number;
  minute: number;
  plan?: string;
}) {
  handle.db
    .insert(usage)
    .values({
      userId: owner,
      planId: values.plan ?? planId,
      kind: values.kind,
      refId: values.refId ?? null,
      model: values.model ?? "m/a",
      inputTokens: 100,
      outputTokens: 10,
      costUsd: values.costUsd,
      createdAt: new Date(2026, 9, 15, 10, values.minute),
    })
    .run();
}

const service = () =>
  createUsageService({ repo: createUsageRepo(handle.db), budget: () => budget });

describe("pemakaian AI per plan", () => {
  it("mengelompokkan panggilan satu job menjadi satu run, terbaru dulu", () => {
    record({ kind: "questions", costUsd: 0.001, minute: 0 });
    record({ kind: "spec", refId: "job-1", model: "m/a", costUsd: 0.01, minute: 1 });
    record({ kind: "tasks", refId: "job-1", model: "m/b", costUsd: 0.02, minute: 2 });
    record({ kind: "chat", costUsd: 0.003, minute: 5 });

    const { runs, totals } = service().getPlanUsage(owner, planId);

    expect(runs.map((r) => r.kinds)).toEqual([
      ["chat"],
      ["spec", "tasks"],
      ["questions"],
    ]);
    expect(runs[1]).toMatchObject({
      id: "job-1",
      calls: 2,
      inputTokens: 200,
      outputTokens: 20,
      startedAt: new Date(2026, 9, 15, 10, 1),
    });
    expect(runs[1]?.models.toSorted()).toEqual(["m/a", "m/b"]);
    expect(runs[1]?.costUsd).toBeCloseTo(0.03);
    expect(totals).toMatchObject({ calls: 4, inputTokens: 400, outputTokens: 40 });
    expect(totals.costUsd).toBeCloseTo(0.034);
  });

  it("hanya menghitung plan yang diminta dan menyertakan status batas", () => {
    record({ kind: "prd", costUsd: 1, minute: 0, plan: seedPlan(owner) });
    const result = service().getPlanUsage(owner, planId);
    expect(result).toEqual({
      runs: [],
      totals: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      budget,
    });
  });

  it("plan milik pengguna lain terbaca kosong", () => {
    record({ kind: "prd", costUsd: 1, minute: 0 });
    const stranger = seedUser(handle.db, "lain@piard.local").id;
    const result = service().getPlanUsage(stranger, planId);
    expect(result.runs).toEqual([]);
    expect(result.totals.calls).toBe(0);
  });
});
