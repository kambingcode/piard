import { desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService, type PlansService } from "@/features/plans/server/service";
import type { RoadmapOutput } from "@/features/roadmap/ai/roadmap.schema";
import { createRoadmapRepo } from "@/features/roadmap/server/repo";
import {
  createRoadmapService,
  ROADMAP_JOB,
  type RoadmapService,
} from "@/features/roadmap/server/service";
import { type AiClient, createAiClient } from "@/server/ai/client";
import { databaseUsageRecorder } from "@/server/ai/usage";
import type { LlmConfig } from "@/server/config/env";
import type { DbHandle } from "@/server/db/client";
import { jobs as jobsTable, usage } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createJobRepo, createJobRunner, type JobRunner } from "@/server/jobs";
import { createLogger } from "@/server/logger";
import { createTestDb, seedUser } from "../helpers/test-db";

const mockLlm: LlmConfig = {
  mode: "mock",
  models: {
    questions: "m",
    roadmap: "mock/roadmap",
    prd: "m",
    spec: "m",
    tasks: "m",
    chat: "m",
    codebase: "m",
  },
};
const logger = createLogger({ level: "silent", sink: () => undefined });

let handle: DbHandle;
let plans: PlansService;
let runner: JobRunner;
let roadmap: RoadmapService;
let userId: string;
let otherId: string;

function build(ai: AiClient): RoadmapService {
  runner = createJobRunner({ repo: createJobRepo(handle.db), logger });
  const service = createRoadmapService({
    plans,
    repo: createRoadmapRepo(handle.db),
    ai,
    jobs: runner,
  });
  runner.register(ROADMAP_JOB, service.runJob);
  return service;
}

function mockAi(): AiClient {
  return createAiClient({
    llm: mockLlm,
    logger,
    recordUsage: databaseUsageRecorder(handle.db),
  });
}

/** Klien AI tiruan yang mengirim objek parsial dari `output` lalu mengembalikannya. */
function scriptedAi(
  output: RoadmapOutput,
  hooks: { beforeEach?: (i: number) => Promise<void>; fail?: AppError } = {},
): AiClient {
  const base = mockAi();
  return {
    ...base,
    async streamStructured(args) {
      for (let i = 1; i <= output.features.length; i++) {
        await hooks.beforeEach?.(i);
        await args.onPartial?.({
          title: output.title,
          features: output.features.slice(0, i),
        } as never);
      }
      if (hooks.fail) throw hooks.fail;
      return {
        data: output as never,
        model: "v/r",
        usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      };
    },
  };
}

const feature = (name: string, phase: number, subs = 3) => ({
  name,
  summary: `${name} ringkas.`,
  icon: "tidak-dikenal",
  phase,
  subFeatures: Array.from({ length: subs }, (_, i) => ({
    name: `${name} ${i + 1}`,
    summary: "s",
    icon: "list",
  })),
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  handle = createTestDb();
  plans = createPlansService(createPlansRepo(handle.db));
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
  roadmap = build(mockAi());
});
afterEach(async () => {
  await runner.idle();
  handle.close();
});

const newPlan = (idea = "Aplikasi booking klinik") =>
  plans.createPlan(userId, { idea, language: "id" });

describe("job roadmap (mode mock)", () => {
  it("menyusun 5-8 fitur dengan 3-5 sub-fitur, fase berurutan, dan judul plan", async () => {
    const plan = newPlan();
    expect(roadmap.getRoadmap(userId, plan.id)).toMatchObject({
      status: "idle",
      job: null,
    });

    expect(roadmap.startRoadmap(userId, plan.id)).toEqual({ status: "generating" });
    expect(roadmap.getRoadmap(userId, plan.id).status).toBe("generating");
    await runner.idle();

    const state = roadmap.getRoadmap(userId, plan.id);
    expect(state.status).toBe("ready");
    expect(state.job).toMatchObject({ phase: "done", error: null });
    expect(state.features.length).toBeGreaterThanOrEqual(5);
    expect(state.features.length).toBeLessThanOrEqual(8);
    expect(state.features.map((f) => f.position)).toEqual(
      state.features.map((_, i) => i),
    );
    const phases = state.features.map((f) => f.phase ?? 0);
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
    expect(phases[0]).toBe(1);

    for (const f of state.features) {
      const subs = state.subFeatures.filter((s) => s.parentId === f.id);
      expect(subs.length).toBeGreaterThanOrEqual(3);
      expect(subs.length).toBeLessThanOrEqual(5);
      for (const s of subs) {
        expect(s.featureId).toBe(f.id);
        expect(s.phase).toBe(f.phase);
      }
      expect(f).toMatchObject({ source: "ai", status: "planned", planId: plan.id });
    }

    const after = plans.getPlan(userId, plan.id).plan;
    expect(after.title).toBe("Aplikasi booking klinik");
    expect(state.title).toBe(after.title);
    expect(after.syncState).toMatchObject({ totalPhases: Math.max(...phases) });
    expect(typeof after.syncState.skeletonGeneratedAt).toBe("string");

    const rows = handle.db.select().from(usage).orderBy(desc(usage.createdAt)).all();
    expect(rows).toMatchObject([{ kind: "roadmap", planId: plan.id, userId }]);
  });

  it("judul plan yang sudah ada tidak ditimpa", async () => {
    const plan = newPlan();
    plans.updatePlan(userId, plan.id, { title: "Judul Saya" });
    roadmap.startRoadmap(userId, plan.id);
    await runner.idle();
    expect(roadmap.getRoadmap(userId, plan.id).title).toBe("Judul Saya");
  });
});

describe("startRoadmap", () => {
  it("idempoten: tidak membuat job kedua saat berjalan atau saat roadmap sudah ada", async () => {
    const plan = newPlan();
    roadmap.startRoadmap(userId, plan.id);
    expect(roadmap.startRoadmap(userId, plan.id)).toEqual({ status: "generating" });
    await runner.idle();
    expect(roadmap.startRoadmap(userId, plan.id)).toEqual({ status: "ready" });
    await runner.idle();
    expect(handle.db.select().from(jobsTable).all()).toHaveLength(1);
  });

  it("regenerate mengganti seluruh roadmap, termasuk fitur buatan pengguna", async () => {
    const plan = newPlan();
    roadmap.startRoadmap(userId, plan.id);
    await runner.idle();
    const before = roadmap.getRoadmap(userId, plan.id);
    roadmap.createFeature(userId, { planId: plan.id, name: "Fitur Saya", summary: "" });

    roadmap.startRoadmap(userId, plan.id, { regenerate: true });
    await runner.idle();
    const after = roadmap.getRoadmap(userId, plan.id);
    expect(after.features).toHaveLength(before.features.length);
    expect(after.features.some((f) => f.name === "Fitur Saya")).toBe(false);
    expect(after.features[0]?.id).not.toBe(before.features[0]?.id);
  });

  it("plan milik orang lain diperlakukan tidak ada", () => {
    const plan = newPlan();
    expect(() => roadmap.startRoadmap(otherId, plan.id)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => roadmap.getRoadmap(otherId, plan.id)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});

describe("penyimpanan bertahap dan galat", () => {
  const output: RoadmapOutput = {
    title: "Klinik Sehat",
    features: [feature("Booking", 2), feature("Bayar", 5), feature("Ulasan", 2)],
  };

  it("fitur muncul satu per satu selama job berjalan, lalu dirapikan di akhir", async () => {
    const gates = [deferred(), deferred(), deferred()];
    const reached = [deferred(), deferred(), deferred()];
    const service = build(
      scriptedAi(output, {
        beforeEach: async (i) => {
          reached[i - 1]?.resolve();
          await gates[i - 1]?.promise;
        },
      }),
    );
    const plan = newPlan();
    service.startRoadmap(userId, plan.id);

    // Parsial ke-1 dan ke-2 belum menuntaskan fitur mana pun... sampai fitur ke-2 mulai ditulis.
    gates[0]?.resolve();
    await reached[1]?.promise;
    expect(service.getRoadmap(userId, plan.id)).toMatchObject({
      status: "generating",
      features: [],
    });
    gates[1]?.resolve();
    await reached[2]?.promise;
    const mid = service.getRoadmap(userId, plan.id);
    expect(mid.status).toBe("generating");
    expect(mid.features.map((f) => f.name)).toEqual(["Booking"]);
    expect(mid.subFeatures).toHaveLength(3);
    expect(mid.job).toMatchObject({ phase: "features", done: 1 });

    // Edit ditolak selama job berjalan.
    expect(() =>
      service.updateFeature(userId, mid.features[0]?.id ?? "", { name: "X" }),
    ).toThrow(expect.objectContaining({ code: "CONFLICT" }));

    gates[2]?.resolve();
    await runner.idle();
    const done = service.getRoadmap(userId, plan.id);
    expect(done.status).toBe("ready");
    // Fase 2,5,2 dipadatkan menjadi 1,2,1 lalu diurutkan stabil: Booking, Ulasan, Bayar.
    expect(done.features.map((f) => [f.name, f.phase, f.position])).toEqual([
      ["Booking", 1, 0],
      ["Ulasan", 1, 1],
      ["Bayar", 2, 2],
    ]);
    const bayar = done.features.find((f) => f.name === "Bayar");
    expect(
      done.subFeatures.filter((s) => s.parentId === bayar?.id).map((s) => s.phase),
    ).toEqual([2, 2, 2]);
    // Ikon tidak dikenal diganti tebakan dari nama.
    expect(bayar?.icon).toBe("payment");
    expect(plans.getPlan(userId, plan.id).plan.syncState).toMatchObject({
      totalPhases: 2,
    });
  });

  it("galat AI menandai roadmap gagal dengan pesan yang bisa dibaca, dan bisa dicoba lagi", async () => {
    const service = build(
      scriptedAi(output, { fail: new AppError("UPSTREAM_AI", "Layanan AI sibuk.") }),
    );
    const plan = newPlan();
    service.startRoadmap(userId, plan.id);
    await runner.idle();
    const failed = service.getRoadmap(userId, plan.id);
    expect(failed.status).toBe("failed");
    expect(failed.job?.error).toBe("Layanan AI sibuk.");
    // Hasil parsial tetap terlihat.
    expect(failed.features.length).toBeGreaterThan(0);

    const retry = build(mockAi());
    expect(retry.startRoadmap(userId, plan.id)).toEqual({ status: "generating" });
    await runner.idle();
    expect(retry.getRoadmap(userId, plan.id).status).toBe("ready");
  });

  it("job yang tertinggal saat proses mati diulang dari awal tanpa duplikat", async () => {
    const plan = newPlan();
    roadmap.startRoadmap(userId, plan.id);
    await runner.idle();
    const count = roadmap.getRoadmap(userId, plan.id).features.length;

    // Simulasikan proses mati di tengah job: state masih `running`.
    const job = handle.db.select().from(jobsTable).get();
    handle.db
      .update(jobsTable)
      .set({ state: "running", attempts: 1 })
      .where(eq(jobsTable.id, job?.id ?? ""))
      .run();
    const restarted = build(mockAi());
    expect(runner.recover()).toBe(1);
    await runner.idle();
    const state = restarted.getRoadmap(userId, plan.id);
    expect(state.status).toBe("ready");
    expect(state.features).toHaveLength(count);
  });

  it("plan yang dihapus saat job antre membuat job gagal tanpa merusak apa pun", async () => {
    const plan = newPlan();
    roadmap.startRoadmap(userId, plan.id);
    plans.deletePlan(userId, plan.id);
    await runner.idle();
    expect(handle.db.select().from(jobsTable).all()).toHaveLength(0); // ikut terhapus (cascade)
  });
});

describe("CRUD fitur dan sub-fitur", () => {
  async function readyPlan() {
    const plan = newPlan();
    roadmap.startRoadmap(userId, plan.id);
    await runner.idle();
    return { plan, state: roadmap.getRoadmap(userId, plan.id) };
  }

  it("menambah fitur pengguna di akhir dengan fase terakhir, lalu sub-fiturnya", async () => {
    const { plan, state } = await readyPlan();
    const lastPhase = Math.max(...state.features.map((f) => f.phase ?? 0));
    const created = roadmap.createFeature(userId, {
      planId: plan.id,
      name: "Program Loyalitas",
      summary: "Poin tiap kunjungan.",
    });
    expect(created).toMatchObject({
      source: "user",
      position: state.features.length,
      phase: lastPhase,
      parentId: null,
      icon: "sparkles",
    });

    const sub = roadmap.createSubFeature(userId, {
      featureId: created.id,
      name: "Kumpulkan Poin",
      summary: "",
    });
    expect(sub).toMatchObject({
      parentId: created.id,
      featureId: created.id,
      position: 0,
      phase: lastPhase,
      source: "user",
    });
    expect(roadmap.listSubFeatures(userId, plan.id, created.id)).toHaveLength(1);
    expect(roadmap.listFeatures(userId, plan.id)).toHaveLength(state.features.length + 1);
  });

  it("fase fitur yang diubah ikut diterapkan ke sub-fiturnya", async () => {
    const { plan, state } = await readyPlan();
    const target = state.features[0];
    if (!target) throw new Error("tanpa fitur");
    const updated = roadmap.updateFeature(userId, target.id, {
      name: "Nama Baru",
      summary: "Ringkasan baru",
      phase: 4,
      status: "in-progress",
    });
    expect(updated).toMatchObject({
      name: "Nama Baru",
      summary: "Ringkasan baru",
      phase: 4,
      status: "in-progress",
    });
    const subs = roadmap.listSubFeatures(userId, plan.id, target.id);
    expect(subs.every((s) => s.phase === 4)).toBe(true);
  });

  it("mengubah dan menghapus sub-fitur; menghapus fitur ikut menghapus sub-fiturnya", async () => {
    const { plan, state } = await readyPlan();
    const target = state.features[0];
    const sub = state.subFeatures.find((s) => s.parentId === target?.id);
    if (!target || !sub) throw new Error("data kurang");

    expect(roadmap.updateSubFeature(userId, sub.id, { name: "Sub Baru" }).name).toBe(
      "Sub Baru",
    );
    roadmap.deleteSubFeature(userId, sub.id);
    const remaining = roadmap.listSubFeatures(userId, plan.id, target.id);
    expect(remaining.find((s) => s.id === sub.id)).toBeUndefined();

    roadmap.deleteFeature(userId, target.id);
    expect(roadmap.listSubFeatures(userId, plan.id, target.id)).toEqual([]);
    expect(roadmap.listFeatures(userId, plan.id).find((f) => f.id === target.id)).toBe(
      undefined,
    );
  });

  it("fitur dan sub-fitur tidak bisa saling tertukar lewat endpoint yang salah", async () => {
    const { state } = await readyPlan();
    const target = state.features[0];
    const sub = state.subFeatures[0];
    if (!target || !sub) throw new Error("data kurang");
    expect(() => roadmap.updateFeature(userId, sub.id, { name: "x" })).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => roadmap.deleteSubFeature(userId, target.id)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() =>
      roadmap.createSubFeature(userId, { featureId: sub.id, name: "x", summary: "" }),
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("pengguna lain tidak bisa membaca atau mengubah roadmap", async () => {
    const { plan, state } = await readyPlan();
    const target = state.features[0];
    if (!target) throw new Error("tanpa fitur");
    for (const attempt of [
      () => roadmap.listFeatures(otherId, plan.id),
      () => roadmap.updateFeature(otherId, target.id, { name: "x" }),
      () => roadmap.deleteFeature(otherId, target.id),
      () => roadmap.createFeature(otherId, { planId: plan.id, name: "x", summary: "" }),
      () =>
        roadmap.createSubFeature(otherId, {
          featureId: target.id,
          name: "x",
          summary: "",
        }),
    ]) {
      expect(attempt).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
    }
    expect(roadmap.listFeatures(userId, plan.id)).toHaveLength(state.features.length);
  });

  it("fitur pertama tanpa roadmap mendapat fase 1 dan posisi 0, lalu status ready", () => {
    const plan = newPlan();
    const created = roadmap.createFeature(userId, {
      planId: plan.id,
      name: "Pembayaran QRIS",
      summary: "",
    });
    expect(created).toMatchObject({ phase: 1, position: 0, icon: "payment" });
    expect(roadmap.getRoadmap(userId, plan.id).status).toBe("ready");
  });
});
