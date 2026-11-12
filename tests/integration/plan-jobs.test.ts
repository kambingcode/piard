import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanJobsService } from "@/features/plans/server";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService } from "@/features/plans/server/service";
import type { DbHandle } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { createJobRepo, createJobRunner, type JobRunner } from "@/server/jobs";
import { createLogger } from "@/server/logger";
import { createTestDb, seedUser } from "../helpers/test-db";

const logger = createLogger({ level: "silent", sink: () => undefined });

let handle: DbHandle;
let runner: JobRunner;
let release: () => void;

beforeEach(() => {
  handle = createTestDb();
  runner = createJobRunner({ repo: createJobRepo(handle.db), logger });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Job yang menunggu sampai dilepas atau dibatalkan, seperti panggilan model yang lama.
  runner.register("lama", async ({ signal }) => {
    await Promise.race([
      gate,
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve())),
    ]);
  });
});
afterEach(async () => {
  release();
  await runner.idle();
  handle.close();
});

function setup() {
  const plans = createPlansService(createPlansRepo(handle.db));
  const owner = seedUser(handle.db).id;
  const plan = plans.createPlan(owner, { idea: "Aplikasi antre", language: "id" });
  return {
    plans,
    owner,
    planId: plan.id,
    service: createPlanJobsService({ plans, jobs: runner }),
  };
}

describe("membatalkan job plan", () => {
  it("membatalkan job yang berjalan dan yang antre milik plan itu saja", async () => {
    const { planId, service, plans, owner } = setup();
    const other = plans.createPlan(owner, { idea: "Plan lain", language: "id" }).id;
    const running = runner.enqueue({ kind: "lama", planId, payload: { n: 1 } });
    const queued = runner.enqueue({ kind: "lama", planId, payload: { n: 2 } });
    const untouched = runner.enqueue({ kind: "lama", planId: other });
    await Promise.resolve();

    expect(service.cancel(owner, planId)).toEqual({ cancelled: 2 });
    expect(runner.get(queued.id)?.state).toBe("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(runner.get(running.id)?.state).toBe("cancelled");
    expect(["queued", "running"]).toContain(runner.get(untouched.id)?.state);
  });

  it("tanpa job aktif menjawab nol", () => {
    const { planId, service, owner } = setup();
    expect(service.cancel(owner, planId)).toEqual({ cancelled: 0 });
  });

  it("plan milik orang lain dianggap tidak ada dan job-nya tidak disentuh", async () => {
    const { planId, service } = setup();
    const job = runner.enqueue({ kind: "lama", planId });
    const stranger = seedUser(handle.db, "lain@piard.local").id;
    expect(() => service.cancel(stranger, planId)).toThrow(AppError);
    expect(["queued", "running"]).toContain(runner.get(job.id)?.state);
  });
});
