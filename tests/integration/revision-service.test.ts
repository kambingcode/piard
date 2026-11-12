import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService, type PlansService } from "@/features/plans/server/service";
import { createDraftStore } from "@/features/prd/server/drafts";
import { createPrdRepo } from "@/features/prd/server/repo";
import {
  createPrdService,
  PRD_JOB,
  PRD_REVISE_JOB,
  type PrdService,
} from "@/features/prd/server/service";
import type { ChatStreamEvent } from "@/features/revision";
import { MOCK_FEATURE } from "@/features/revision/ai/chat.mock";
import { createRevisionRepo } from "@/features/revision/server/repo";
import {
  createRevisionService,
  RECONCILE_JOB,
  type RevisionService,
} from "@/features/revision/server/service";
import { createRoadmapRepo } from "@/features/roadmap/server/repo";
import {
  createRoadmapService,
  ROADMAP_JOB,
  type RoadmapService,
} from "@/features/roadmap/server/service";
import {
  BUILD_JOB,
  createSpecsService,
  FEATURE_TASKS_JOB,
  type SpecsService,
  SYNC_TASKS_JOB,
} from "@/features/specs/server/service";
import { createTasksRepo } from "@/features/tasks/server/repo";
import { createTasksService, type TasksService } from "@/features/tasks/server/service";
import { type AiClient, createAiClient } from "@/server/ai/client";
import { databaseUsageRecorder } from "@/server/ai/usage";
import type { LlmConfig } from "@/server/config/env";
import type { DbHandle } from "@/server/db/client";
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
    chat: "mock/chat",
    codebase: "mock/codebase",
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
let revision: RevisionService;
let userId: string;
let otherId: string;

const mockAi = (): AiClient =>
  createAiClient({ llm: mockLlm, logger, recordUsage: databaseUsageRecorder(handle.db) });

function build(chatAi: AiClient = mockAi()) {
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
  specs = createSpecsService({ plans, roadmap, prd, tasks, ai: mockAi(), jobs: runner });
  revision = createRevisionService({
    plans,
    prd,
    roadmap,
    repo: createRevisionRepo(handle.db),
    ai: chatAi,
    jobs: runner,
  });
  runner.register(ROADMAP_JOB, roadmap.runJob);
  runner.register(PRD_JOB, prd.runJob);
  runner.register(PRD_REVISE_JOB, prd.runReviseJob);
  runner.register(BUILD_JOB, specs.runBuildJob);
  runner.register(FEATURE_TASKS_JOB, specs.runFeatureTasksJob);
  runner.register(SYNC_TASKS_JOB, specs.runSyncTasksJob);
  runner.register(RECONCILE_JOB, revision.runReconcileJob);
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

async function chat(planId: string, text: string): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of revision.sendMessage(userId, planId, text))
    events.push(event);
  return events;
}

const doneMessage = (events: ChatStreamEvent[]) => {
  const done = events.find((e) => e.type === "done");
  if (done?.type !== "done") throw new Error("tidak ada event done");
  return done.message;
};

describe("chat revisi", () => {
  it("pertanyaan dijawab dan disimpan tanpa tindakan", async () => {
    const plan = await planWithPrd();
    const events = await chat(plan.id, "Apa risiko terbesar?");
    expect(events[0]).toMatchObject({ type: "user", message: { role: "user" } });
    expect(events.some((e) => e.type === "text")).toBe(true);
    expect(doneMessage(events).parts).toEqual([
      { type: "text", text: expect.stringContaining("Risiko utamanya") },
    ]);
    expect(revision.listMessages(userId, plan.id).map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(prd.getPrd(userId, plan.id).document?.version).toBe(1);
  });

  it("permintaan fitur: PRD direvisi (versi baru, PRD berubah) dan usulan fitur menunggu keputusan", async () => {
    const plan = await planWithPrd();
    const events = await chat(plan.id, "Tambahkan fitur notifikasi pengingat");
    const parts = events.flatMap((e) => (e.type === "part" ? [e.part] : []));
    expect(parts.map((p) => p.type)).toEqual(["prd-revision", "proposal"]);
    expect(parts[0]).toMatchObject({ status: "running", version: null });

    // Revisi berjalan sebagai job PRD: status "generating" dengan jenis revise.
    expect(prd.getPrd(userId, plan.id)).toMatchObject({
      status: "generating",
      job: { kind: "revise" },
    });
    await runner.idle();
    const after = prd.getPrd(userId, plan.id);
    expect(after.document?.version).toBe(2);
    expect(after.document?.content).toContain("- Tambahkan fitur notifikasi pengingat");

    const [, reply] = revision.listMessages(userId, plan.id);
    expect(reply?.parts.map((p) => p.type)).toEqual([
      "text",
      "prd-revision",
      "text",
      "proposal",
    ]);
    expect(reply?.parts[1]).toMatchObject({ status: "done", version: 2 });

    const sync = revision.getSyncStatus(userId, plan.id);
    expect(sync.prd).toEqual({ dirty: true, version: 2 });
    expect(sync.pending).toHaveLength(1);
    expect(sync.pending[0]).toMatchObject({
      scope: "chat",
      changes: [{ op: "add", name: MOCK_FEATURE.name }],
    });
  });

  it("menerima usulan menambah fitur ke roadmap dan menandainya basi; tidak bisa diterima dua kali", async () => {
    const plan = await planWithPrd();
    await chat(plan.id, "Tambahkan fitur notifikasi pengingat");
    await runner.idle();
    const proposal = revision.getSyncStatus(userId, plan.id).pending[0];
    if (!proposal) throw new Error("usulan tidak ada");

    expect(() => revision.applyProposal(otherId, proposal.id)).toThrow(AppError);
    const result = revision.applyProposal(userId, proposal.id);
    expect(result).toMatchObject({ proposal: { status: "accepted" }, changed: 1 });

    const state = roadmap.getRoadmap(userId, plan.id);
    const added = state.features.find((f) => f.name === MOCK_FEATURE.name);
    expect(added).toMatchObject({ source: "ai", position: state.features.length - 1 });
    expect(state.subFeatures.filter((s) => s.parentId === added?.id)).toHaveLength(2);
    expect(result.sync.staleFeatureIds).toEqual([added?.id]);
    // Usulan dari chat tidak menandai PRD selaras; itu tugas "Sesuaikan fitur dengan PRD".
    expect(result.sync.prd.dirty).toBe(true);
    expect(() => revision.applyProposal(userId, proposal.id)).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
    const [, reply] = revision.listMessages(userId, plan.id);
    expect(reply?.parts.at(-1)).toMatchObject({ proposal: { status: "accepted" } });
  });

  it("menolak usulan tidak mengubah roadmap", async () => {
    const plan = await planWithPrd();
    await chat(plan.id, "Tambahkan fitur notifikasi pengingat");
    await runner.idle();
    const before = roadmap.getRoadmap(userId, plan.id).features.length;
    const id = revision.getSyncStatus(userId, plan.id).pending[0]?.id ?? "";
    expect(revision.rejectProposal(userId, id).proposal.status).toBe("rejected");
    expect(roadmap.getRoadmap(userId, plan.id).features).toHaveLength(before);
    expect(revision.getSyncStatus(userId, plan.id).staleFeatureIds).toEqual([]);
  });

  it("revisi ditolak saat PRD sedang dibuat: dicatat sebagai pemberitahuan, bukan galat", async () => {
    const plan = await planWithPrd();
    prd.startPrd(userId, plan.id, { regenerate: true }); // job antre, belum berjalan
    const events = await chat(plan.id, "Ubah bagian kebutuhan");
    const message = doneMessage(events);
    expect(message.parts.map((p) => p.type)).toEqual(["text", "notice"]);
    expect(message.parts[1]).toMatchObject({
      text: expect.stringContaining("sedang dibuat"),
    });
  });

  it("menolak chat tanpa PRD, milik orang lain, atau saat balasan lain masih berjalan", async () => {
    const plan = plans.createPlan(userId, { idea: "Ide", language: "id" });
    expect(() => revision.sendMessage(userId, plan.id, "halo")).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
    const ready = await planWithPrd();
    expect(() => revision.sendMessage(otherId, ready.id, "halo")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    const first = revision.sendMessage(userId, ready.id, "halo");
    expect(() => revision.sendMessage(userId, ready.id, "lagi")).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
    for await (const _ of first) {
      // dihabiskan; kunci dilepas sesudahnya
    }
    expect(() => revision.sendMessage(userId, ready.id, "lagi")).not.toThrow();
  });

  it("model gagal sebelum menjawab: event galat dan pesan pengguna tidak tersimpan", async () => {
    const plan = await planWithPrd();
    const failing: AiClient = {
      ...mockAi(),
      streamChat: () => {
        const error = new AppError("UPSTREAM_AI", "Kuota habis.");
        const completed = Promise.reject(error);
        completed.catch(() => undefined);
        return {
          events: (async function* () {
            yield* [];
            throw error;
          })(),
          completed,
        };
      },
    };
    build(failing);
    const events = await chat(plan.id, "halo");
    expect(events.map((e) => e.type)).toEqual(["user", "error"]);
    expect(events[1]).toEqual({ type: "error", error: "Kuota habis." });
    expect(revision.listMessages(userId, plan.id)).toEqual([]);
  });
});

describe("sinkronisasi PRD dan fitur", () => {
  it("edit PRD menandai PRD berubah; membuat ulang PRD dari roadmap menghapus tandanya", async () => {
    const plan = await planWithPrd();
    expect(revision.getSyncStatus(userId, plan.id).prd).toEqual({
      dirty: false,
      version: 1,
    });
    const current = prd.getPrd(userId, plan.id).document?.content ?? "";
    prd.saveDocument(userId, plan.id, `${current}\nTambahan.`);
    expect(revision.getSyncStatus(userId, plan.id).prd).toEqual({
      dirty: true,
      version: 2,
    });
    prd.startPrd(userId, plan.id, { regenerate: true });
    await runner.idle();
    expect(revision.getSyncStatus(userId, plan.id).prd).toEqual({
      dirty: false,
      version: 3,
    });
  });

  it("penyesuaian tanpa perbedaan menandai PRD selaras", async () => {
    const plan = await planWithPrd();
    const current = prd.getPrd(userId, plan.id).document?.content ?? "";
    prd.saveDocument(userId, plan.id, `${current}\nCatatan.`);
    expect(revision.startReconcile(userId, plan.id).reconciling).toBe(true);
    await runner.idle();
    const sync = revision.getSyncStatus(userId, plan.id);
    expect(sync).toMatchObject({
      prd: { dirty: false },
      pending: [],
      reconciling: false,
    });
  });

  it("penyesuaian mengusulkan fitur dari PRD; menerimanya menerapkan dan menandai PRD selaras", async () => {
    const plan = await planWithPrd();
    const first = roadmap.getRoadmap(userId, plan.id).features[0];
    if (!first) throw new Error("roadmap kosong");
    const current = prd.getPrd(userId, plan.id).document?.content ?? "";
    prd.saveDocument(
      userId,
      plan.id,
      current.replace(`**${first.name}**`, "**Dompet Digital**"),
    );
    revision.startReconcile(userId, plan.id);
    await runner.idle();
    const proposal = revision.getSyncStatus(userId, plan.id).pending[0];
    expect(proposal).toMatchObject({
      scope: "prd-to-features",
      changes: [
        { op: "add", name: "Dompet Digital" },
        { op: "remove", featureId: first.id, name: first.name },
      ],
    });
    // Penyesuaian kedua menggantikan usulan lama, tidak menumpuk.
    revision.startReconcile(userId, plan.id);
    await runner.idle();
    const pending = revision.getSyncStatus(userId, plan.id).pending;
    expect(pending).toHaveLength(1);

    const result = revision.applyProposal(userId, pending[0]?.id ?? "");
    const names = roadmap.getRoadmap(userId, plan.id).features.map((f) => f.name);
    expect(names).toContain("Dompet Digital");
    expect(names).not.toContain(first.name);
    expect(result.sync.prd.dirty).toBe(false);
    expect(result.sync.staleFeatureIds).toHaveLength(1);
  });

  it("Abaikan menandai PRD selaras tanpa mengubah fitur", async () => {
    const plan = await planWithPrd();
    const current = prd.getPrd(userId, plan.id).document?.content ?? "";
    prd.saveDocument(userId, plan.id, `${current}\nCatatan.`);
    expect(revision.dismissPrdChange(userId, plan.id).prd.dirty).toBe(false);
    expect(() => revision.dismissPrdChange(otherId, plan.id)).toThrow(AppError);
  });
});

describe("revisi PRD langsung", () => {
  it("tanpa permintaan, revisi terakhir diulang; tanpa riwayat revisi ditolak", async () => {
    const plan = await planWithPrd();
    expect(() => prd.startRevision(userId, plan.id)).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
    prd.startRevision(userId, plan.id, "Tambahkan audit log");
    await runner.idle();
    expect(() => prd.startRevision(userId, plan.id, "lagi")).not.toThrow();
    await runner.idle();
    const retried = prd.startRevision(userId, plan.id);
    expect(retried.fromVersion).toBe(3);
    await runner.idle();
    expect(prd.getPrd(userId, plan.id).document?.content.match(/- lagi/g)).toHaveLength(
      2,
    );
  });
});

describe("penyesuaian task", () => {
  it("fitur basi disusun ulang (spesifikasi baru), lalu tidak lagi basi", async () => {
    const plan = await planWithPrd();
    specs.startBuild(userId, plan.id);
    await runner.idle();
    expect(specs.getBuild(userId, plan.id)).toMatchObject({
      status: "ready",
      staleFeatureIds: [],
    });

    const target = roadmap.getRoadmap(userId, plan.id).features[0];
    if (!target) throw new Error("roadmap kosong");
    const proposal = revision.getSyncStatus(userId, plan.id); // kosong; buat usulan lewat chat
    expect(proposal.pending).toEqual([]);
    await chat(plan.id, "Tambahkan fitur notifikasi pengingat");
    await runner.idle();
    const id = revision.getSyncStatus(userId, plan.id).pending[0]?.id ?? "";
    revision.applyProposal(userId, id);

    const stale = specs.getBuild(userId, plan.id);
    expect(stale.staleFeatureIds).toHaveLength(1);
    expect(stale.status).toBe("partial"); // fitur baru belum punya spesifikasi

    expect(specs.startSyncTasks(userId, plan.id).status).toBe("generating");
    await runner.idle();
    const done = specs.getBuild(userId, plan.id);
    expect(done).toMatchObject({ status: "ready", staleFeatureIds: [] });
    expect(revision.getSyncStatus(userId, plan.id).staleFeatureIds).toEqual([]);
    // Tidak ada yang basi: tidak membuat job baru.
    expect(specs.startSyncTasks(userId, plan.id).status).toBe("ready");
  });
});
