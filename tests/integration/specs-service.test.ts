import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService, type PlansService } from "@/features/plans/server/service";
import { createDraftStore } from "@/features/prd/server/drafts";
import { createPrdRepo } from "@/features/prd/server/repo";
import {
  createPrdService,
  PRD_JOB,
  type PrdService,
} from "@/features/prd/server/service";
import { createRoadmapRepo } from "@/features/roadmap/server/repo";
import {
  createRoadmapService,
  ROADMAP_JOB,
  type RoadmapService,
} from "@/features/roadmap/server/service";
import type { BuildJobEvent } from "@/features/specs";
import {
  BUILD_JOB,
  createSpecsService,
  FEATURE_TASKS_JOB,
  type SpecsService,
} from "@/features/specs/server/service";
import { createTasksRepo } from "@/features/tasks/server/repo";
import { createTasksService, type TasksService } from "@/features/tasks/server/service";
import { type AiClient, createAiClient } from "@/server/ai/client";
import { databaseUsageRecorder } from "@/server/ai/usage";
import type { LlmConfig } from "@/server/config/env";
import type { DbHandle } from "@/server/db/client";
import { usage } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createJobRepo, createJobRunner, type JobRunner } from "@/server/jobs";
import { createLogger } from "@/server/logger";
import { createTestDb, seedUser } from "../helpers/test-db";

const mockLlm: LlmConfig = {
  mode: "mock",
  models: {
    questions: "m",
    roadmap: "mock/roadmap",
    prd: "mock/prd",
    spec: "mock/spec",
    tasks: "mock/tasks",
    chat: "m",
    codebase: "m",
  },
};
const logger = createLogger({ level: "silent", sink: () => undefined });

let handle: DbHandle;
let plans: PlansService;
let runner: JobRunner;
let roadmap: RoadmapService;
let prd: PrdService;
let tasks: TasksService;
let specs: SpecsService;
let userId: string;
let otherId: string;

function mockAi(): AiClient {
  return createAiClient({
    llm: mockLlm,
    logger,
    recordUsage: databaseUsageRecorder(handle.db),
  });
}

function build(specsAi: AiClient = mockAi(), concurrency?: number) {
  runner = createJobRunner({ repo: createJobRepo(handle.db), logger });
  roadmap = createRoadmapService({
    plans,
    repo: createRoadmapRepo(handle.db),
    ai: mockAi(),
    jobs: runner,
  });
  prd = createPrdService({
    plans,
    roadmap,
    repo: createPrdRepo(handle.db),
    ai: mockAi(),
    jobs: runner,
    drafts: createDraftStore(),
  });
  tasks = createTasksService({ plans, repo: createTasksRepo(handle.db) });
  specs = createSpecsService({
    plans,
    roadmap,
    prd,
    tasks,
    ai: specsAi,
    jobs: runner,
    concurrency,
  });
  runner.register(ROADMAP_JOB, roadmap.runJob);
  runner.register(PRD_JOB, prd.runJob);
  runner.register(BUILD_JOB, specs.runBuildJob);
  runner.register(FEATURE_TASKS_JOB, specs.runFeatureTasksJob);
}

beforeEach(() => {
  handle = createTestDb();
  plans = createPlansService(createPlansRepo(handle.db));
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
  build();
});
afterEach(async () => {
  await runner.idle();
  handle.close();
});

async function planWithPrd() {
  const plan = plans.createPlan(userId, {
    idea: "Aplikasi booking klinik",
    language: "id",
  });
  roadmap.startRoadmap(userId, plan.id);
  await runner.idle();
  prd.startPrd(userId, plan.id);
  await runner.idle();
  return plan;
}

/** AI tiruan: spesifikasi/task dari mock, dengan kait sebelum tiap panggilan `generateStructured`. */
function hookedAi(
  before: (task: string, prompt: string) => Promise<void> | void,
): AiClient {
  const base = mockAi();
  return {
    ...base,
    async generateStructured(args) {
      await before(args.task, args.prompt ?? "");
      return base.generateStructured(args);
    },
  };
}

describe("job spesifikasi & task (mode mock)", () => {
  it("setiap fitur mendapat spesifikasi Tujuan/Yang dibutuhkan, sub-fitur juga, dan 3 task", async () => {
    const plan = await planWithPrd();
    expect(specs.getBuild(userId, plan.id)).toMatchObject({
      status: "idle",
      doneFeatures: 0,
    });

    expect(specs.startBuild(userId, plan.id)).toEqual({ status: "generating" });
    await runner.idle();

    const state = specs.getBuild(userId, plan.id);
    expect(state).toMatchObject({ status: "ready", incompleteFeatureIds: [] });
    expect(state.doneFeatures).toBe(state.totalFeatures);
    expect(state.totalFeatures).toBeGreaterThanOrEqual(5);

    const after = roadmap.getRoadmap(userId, plan.id);
    for (const feature of after.features) {
      expect(feature.spec).toMatch(/^### Tujuan\n.+\n\n### Yang dibutuhkan\n- /);
      const list = tasks.listTasks(userId, plan.id, feature.id);
      expect(list).toHaveLength(3);
      expect(list.map((t) => t.position)).toEqual([0, 1, 2]);
      expect(list[0]?.prompt).toContain(feature.name);
    }
    for (const sub of after.subFeatures) expect(sub.spec).toContain("### Tujuan");

    const kinds = handle.db
      .select()
      .from(usage)
      .all()
      .map((r) => r.kind);
    expect(kinds.filter((k) => k === "spec")).toHaveLength(after.features.length);
    expect(kinds.filter((k) => k === "tasks")).toHaveLength(after.features.length);
  });

  it("paling banyak 3 fitur diproses bersamaan", async () => {
    const plan = await planWithPrd();
    let active = 0;
    let peak = 0;
    build(
      hookedAi(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      }),
    );
    specs.startBuild(userId, plan.id);
    await runner.idle();
    expect(peak).toBe(3);
    expect(specs.getBuild(userId, plan.id).status).toBe("ready");
  });

  it("fitur yang gagal tidak menghentikan yang lain; lanjutkan hanya mengerjakan yang gagal", async () => {
    const plan = await planWithPrd();
    const first = roadmap.getRoadmap(userId, plan.id).features[0];
    if (!first) throw new Error("roadmap kosong");
    build(
      hookedAi((task, prompt) => {
        if (task === "tasks" && prompt.includes(`SEKARANG: ${first.name}`)) {
          throw new AppError("UPSTREAM_AI", "Model sibuk.");
        }
      }),
    );
    specs.startBuild(userId, plan.id);
    await runner.idle();

    const failed = specs.getBuild(userId, plan.id);
    expect(failed.status).toBe("failed");
    expect(failed.incompleteFeatureIds).toEqual([first.id]);
    expect(failed.job?.error).toContain("1 dari");
    expect(failed.job?.error).toContain("Model sibuk.");
    // Spesifikasi fitur yang gagal di langkah task sudah tersimpan (simpan per langkah).
    expect(roadmap.getRoadmap(userId, plan.id).features[0]?.spec).toContain("### Tujuan");

    const calls: string[] = [];
    build(hookedAi((task) => void calls.push(task)));
    specs.startBuild(userId, plan.id);
    await runner.idle();
    expect(calls).toEqual(["tasks"]); // spesifikasi tidak ditulis ulang, fitur lain tidak disentuh
    expect(specs.getBuild(userId, plan.id).status).toBe("ready");
  });

  it("berhenti lebih awal bila kuota/kunci penyedia menolak; fitur yang sudah selesai tetap tersimpan", async () => {
    const plan = await planWithPrd();
    const { APICallError } = await import("ai");
    let calls = 0;
    build(
      hookedAi(() => {
        calls += 1;
        if (calls > 2) {
          throw new AppError(
            "UPSTREAM_AI",
            "Kuota harian model gratis OpenRouter habis.",
            502,
            new APICallError({
              message: "Rate limit exceeded: free-models-per-day",
              url: "https://openrouter.ai",
              requestBodyValues: {},
              statusCode: 429,
            }),
          );
        }
      }),
      1,
    );
    specs.startBuild(userId, plan.id);
    await runner.idle();
    const state = specs.getBuild(userId, plan.id);
    expect(calls).toBe(3); // fitur pertama (2 panggilan), lalu satu panggilan gagal, lalu berhenti
    expect(state.status).toBe("failed");
    expect(state.doneFeatures).toBe(1);
    expect(state.job?.error).toMatch(
      /^Penyusunan berhenti: \d+ dari \d+ fitur belum disusun\. Kuota harian/,
    );
  });

  it("idempoten saat semua lengkap; regenerate menulis ulang semuanya", async () => {
    const plan = await planWithPrd();
    specs.startBuild(userId, plan.id);
    await runner.idle();
    expect(specs.startBuild(userId, plan.id)).toEqual({ status: "ready" });

    const before = tasks.listTasks(userId, plan.id);
    tasks.updateTask(userId, before[0]?.id ?? "", { status: "done" });
    specs.startBuild(userId, plan.id, { regenerate: true });
    expect(tasks.listTasks(userId, plan.id)).toHaveLength(0);
    await runner.idle();
    const after = tasks.listTasks(userId, plan.id);
    expect(after).toHaveLength(before.length);
    expect(after.every((t) => t.status === "todo")).toBe(true);
    expect(after[0]?.id).not.toBe(before[0]?.id);
  });

  it("fitur baru setelah build membuat status partial, lalu hanya fitur itu yang dikerjakan", async () => {
    const plan = await planWithPrd();
    specs.startBuild(userId, plan.id);
    await runner.idle();
    const added = roadmap.createFeature(userId, {
      planId: plan.id,
      name: "Fitur Baru",
      summary: "Tambahan.",
    });
    expect(specs.getBuild(userId, plan.id)).toMatchObject({
      status: "partial",
      incompleteFeatureIds: [added.id],
    });
    const calls: string[] = [];
    build(
      hookedAi(
        (task, prompt) =>
          void calls.push(`${task}:${prompt.includes("SEKARANG: Fitur Baru")}`),
      ),
    );
    specs.startBuild(userId, plan.id);
    await runner.idle();
    expect(calls).toEqual(["spec:true", "tasks:true"]);
    expect(specs.getBuild(userId, plan.id).status).toBe("ready");
  });

  it("task satu fitur disusun ulang lewat job tersendiri", async () => {
    const plan = await planWithPrd();
    specs.startBuild(userId, plan.id);
    await runner.idle();
    const feature = roadmap.getRoadmap(userId, plan.id).features[1];
    if (!feature) throw new Error("roadmap kurang");
    const old = tasks.listTasks(userId, plan.id, feature.id).map((t) => t.id);
    expect(specs.startFeatureTasks(userId, feature.id)).toEqual({ status: "generating" });
    await runner.idle();
    const fresh = tasks.listTasks(userId, plan.id, feature.id).map((t) => t.id);
    expect(fresh).toHaveLength(3);
    expect(fresh.some((id) => old.includes(id))).toBe(false);
    expect(specs.getBuild(userId, plan.id).job).toMatchObject({
      kind: FEATURE_TASKS_JOB,
    });
  });
});

describe("prasyarat dan kepemilikan", () => {
  it("menolak sebelum PRD ada", async () => {
    const plan = plans.createPlan(userId, { idea: "Ide", language: "id" });
    roadmap.startRoadmap(userId, plan.id);
    await runner.idle();
    expect(() => specs.startBuild(userId, plan.id)).toThrow(
      expect.objectContaining({
        code: "CONFLICT",
        message: expect.stringContaining("PRD"),
      }),
    );
  });

  it("plan atau fitur orang lain diperlakukan seperti tidak ada", async () => {
    const plan = await planWithPrd();
    const feature = roadmap.getRoadmap(userId, plan.id).features[0];
    expect(() => specs.startBuild(otherId, plan.id)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => specs.startFeatureTasks(otherId, feature?.id ?? "")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => specs.subscribe(otherId, plan.id, () => undefined)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});

describe("event SSE", () => {
  it("mengirim keadaan terakhir saat berlangganan lalu progres sampai done", async () => {
    const plan = await planWithPrd();
    const events: BuildJobEvent[] = [];
    const stop = specs.subscribe(userId, plan.id, (e) => events.push(e));
    expect(events).toHaveLength(0);
    specs.startBuild(userId, plan.id);
    await runner.idle();
    stop();
    const last = events.at(-1);
    expect(last).toMatchObject({ kind: BUILD_JOB, status: "done", phase: "done" });
    expect(last?.doneFeatures).toBe(last?.totalFeatures);
    const done = events.filter((e) => e.phase === "enrich").map((e) => e.doneFeatures);
    expect(done).toEqual([...done].sort((a, b) => a - b));
    expect(done.length).toBeGreaterThan(1);

    const late: BuildJobEvent[] = [];
    specs.subscribe(userId, plan.id, (e) => late.push(e))();
    expect(late).toMatchObject([{ status: "done" }]);
  });
});
