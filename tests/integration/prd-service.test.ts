import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService, type PlansService } from "@/features/plans/server/service";
import { createDraftStore, type DraftStore } from "@/features/prd/server/drafts";
import { createPrdRepo } from "@/features/prd/server/repo";
import {
  createPrdService,
  PRD_JOB,
  type PrdService,
} from "@/features/prd/server/service";
import { checkPrdStructure, isCompletePrd } from "@/features/prd/structure";
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
    prd: "mock/prd",
    spec: "m",
    tasks: "m",
    chat: "m",
    codebase: "m",
  },
};
const logger = createLogger({ level: "silent", sink: () => undefined });

const COMPLETE_PRD = [
  "# PRD - Uji",
  "## 1. Ringkasan",
  "a",
  "## 2. Kebutuhan",
  "## 3. Fitur Inti",
  "## 4. Alur Pengguna",
  "## 5. Arsitektur",
  "```mermaid\nsequenceDiagram\n    U->>A: x\n```",
  "## 6. Skema Database",
  "```mermaid\nerDiagram\n    USER ||--o{ ITEM : owns\n```",
  "## 7. Desain & Batasan Teknis",
].join("\n\n");

let handle: DbHandle;
let plans: PlansService;
let runner: JobRunner;
let roadmap: RoadmapService;
let prd: PrdService;
let drafts: DraftStore;
let userId: string;
let otherId: string;

function mockAi(): AiClient {
  return createAiClient({
    llm: mockLlm,
    logger,
    recordUsage: databaseUsageRecorder(handle.db),
  });
}

/** Klien AI tiruan yang mengalirkan `chunks` untuk PRD; `hooks.between` dipanggil sebelum tiap potongan. */
function scriptedAi(
  chunks: string[],
  hooks: { between?: (i: number) => Promise<void>; fail?: AppError } = {},
): AiClient {
  const base = mockAi();
  return {
    ...base,
    streamText(args) {
      if (args.task !== "prd") return base.streamText(args);
      const done = Promise.withResolvers<{
        text: string;
        model: string;
        usage: { inputTokens: number; outputTokens: number; costUsd: number };
      }>();
      done.promise.catch(() => undefined);
      async function* stream() {
        for (const [i, chunk] of chunks.entries()) {
          await hooks.between?.(i);
          yield chunk;
        }
        if (hooks.fail) {
          done.reject(hooks.fail);
          throw hooks.fail;
        }
        done.resolve({
          text: chunks.join(""),
          model: "v/p",
          usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
        });
      }
      return { textStream: stream(), completed: done.promise };
    },
  };
}

function build(ai: AiClient) {
  runner = createJobRunner({ repo: createJobRepo(handle.db), logger });
  roadmap = createRoadmapService({
    plans,
    repo: createRoadmapRepo(handle.db),
    ai: mockAi(),
    jobs: runner,
  });
  drafts = createDraftStore();
  prd = createPrdService({
    plans,
    roadmap,
    repo: createPrdRepo(handle.db),
    ai,
    jobs: runner,
    drafts,
  });
  runner.register(ROADMAP_JOB, roadmap.runJob);
  runner.register(PRD_JOB, prd.runJob);
}

beforeEach(() => {
  handle = createTestDb();
  plans = createPlansService(createPlansRepo(handle.db));
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
  build(mockAi());
});
afterEach(async () => {
  await runner.idle();
  handle.close();
});

/** Plan dengan roadmap yang sudah jadi (mode mock). */
async function planWithRoadmap() {
  const plan = plans.createPlan(userId, {
    idea: "Aplikasi booking klinik",
    language: "id",
  });
  roadmap.startRoadmap(userId, plan.id);
  await runner.idle();
  return plan;
}

describe("job PRD (mode mock)", () => {
  it("menulis PRD 7 bagian dengan fitur roadmap dan menyimpannya sebagai v1", async () => {
    const plan = await planWithRoadmap();
    expect(prd.getPrd(userId, plan.id)).toEqual({
      status: "idle",
      document: null,
      draft: "",
      job: null,
    });

    expect(prd.startPrd(userId, plan.id)).toEqual({ status: "generating" });
    await runner.idle();

    const state = prd.getPrd(userId, plan.id);
    expect(state.status).toBe("ready");
    expect(state.draft).toBe("");
    expect(state.job).toMatchObject({ phase: "done", sections: 7, error: null });
    expect(state.document).toMatchObject({ planId: plan.id, title: "PRD", version: 1 });
    const content = state.document?.content ?? "";
    expect(isCompletePrd(checkPrdStructure(content))).toBe(true);
    const firstFeature = roadmap.getRoadmap(userId, plan.id).features[0]?.name ?? "?";
    expect(content).toContain(firstFeature);

    const rows = handle.db.select().from(usage).all();
    expect(rows.filter((r) => r.kind === "prd")).toMatchObject([{ planId: plan.id }]);
  });
});

describe("startPrd", () => {
  it("menolak bila roadmap belum ada", () => {
    const plan = plans.createPlan(userId, { idea: "Ide", language: "id" });
    expect(() => prd.startPrd(userId, plan.id)).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
  });

  it("menolak selama roadmap masih dibuat", async () => {
    const plan = plans.createPlan(userId, { idea: "Ide", language: "id" });
    roadmap.startRoadmap(userId, plan.id);
    expect(() => prd.startPrd(userId, plan.id)).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
    await runner.idle();
  });

  it("idempoten: tidak membuat job kedua saat berjalan atau saat PRD sudah ada", async () => {
    const plan = await planWithRoadmap();
    prd.startPrd(userId, plan.id);
    expect(prd.startPrd(userId, plan.id)).toEqual({ status: "generating" });
    await runner.idle();
    expect(prd.startPrd(userId, plan.id)).toEqual({ status: "ready" });
    await runner.idle();
    const prdJobs = handle.db
      .select()
      .from(jobsTable)
      .all()
      .filter((j) => j.kind === PRD_JOB);
    expect(prdJobs).toHaveLength(1);
  });

  it("regenerate menyimpan versi berikutnya tanpa menghapus versi lama", async () => {
    const plan = await planWithRoadmap();
    prd.startPrd(userId, plan.id);
    await runner.idle();
    prd.startPrd(userId, plan.id, { regenerate: true });
    await runner.idle();
    expect(prd.getPrd(userId, plan.id).document?.version).toBe(2);
    expect(
      createPrdRepo(handle.db)
        .list(plan.id)
        .map((d) => d.version),
    ).toEqual([2, 1]);
  });

  it("plan milik orang lain diperlakukan seperti tidak ada", async () => {
    const plan = await planWithRoadmap();
    expect(() => prd.startPrd(otherId, plan.id)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => prd.getPrd(otherId, plan.id)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});

describe("job PRD (AI tiruan)", () => {
  it("draf terlihat lewat getPrd selama AI menulis, lalu kosong setelah tersimpan", async () => {
    const plan = await planWithRoadmap();
    const seen: Array<{ status: string; draft: string; sections: number }> = [];
    const half = COMPLETE_PRD.indexOf("## 5.");
    build(
      scriptedAi([COMPLETE_PRD.slice(0, half), COMPLETE_PRD.slice(half)], {
        between: async (i) => {
          if (i === 1) {
            const s = prd.getPrd(userId, plan.id);
            seen.push({
              status: s.status,
              draft: s.draft,
              sections: s.job?.sections ?? -1,
            });
          }
        },
      }),
    );
    prd.startPrd(userId, plan.id);
    await runner.idle();

    expect(seen).toEqual([
      { status: "generating", draft: COMPLETE_PRD.slice(0, half), sections: 4 },
    ]);
    const state = prd.getPrd(userId, plan.id);
    expect(state).toMatchObject({ status: "ready", draft: "" });
    expect(state.document?.content).toBe(`${COMPLETE_PRD}\n`);
  });

  it("merapikan teks pembuka dan pembungkus ``` sebelum menyimpan", async () => {
    const plan = await planWithRoadmap();
    build(scriptedAi(["Berikut PRD-nya:\n\n```markdown\n", COMPLETE_PRD, "\n```"]));
    prd.startPrd(userId, plan.id);
    await runner.idle();
    expect(prd.getPrd(userId, plan.id).document?.content).toBe(`${COMPLETE_PRD}\n`);
  });

  it("PRD tidak lengkap tidak disimpan; job gagal dengan pesan yang menyebut kekurangannya", async () => {
    const plan = await planWithRoadmap();
    build(scriptedAi(["# PRD - X\n\n## 1. Ringkasan\n\nisi"]));
    prd.startPrd(userId, plan.id);
    await runner.idle();
    const state = prd.getPrd(userId, plan.id);
    expect(state.status).toBe("failed");
    expect(state.document).toBeNull();
    expect(state.job?.error).toContain("bagian 2, 3, 4, 5, 6, 7");
    expect(state.job?.error).toContain("sequenceDiagram");
    expect(drafts.get(plan.id)).toBe("");
  });

  it("galat AI di tengah aliran menggagalkan job dan versi lama tetap utuh", async () => {
    const plan = await planWithRoadmap();
    prd.startPrd(userId, plan.id);
    await runner.idle();
    build(
      scriptedAi(["# PRD - X\n"], {
        fail: new AppError("UPSTREAM_AI", "Layanan AI sedang bermasalah."),
      }),
    );
    prd.startPrd(userId, plan.id, { regenerate: true });
    await runner.idle();
    const state = prd.getPrd(userId, plan.id);
    expect(state.status).toBe("failed");
    expect(state.job?.error).toBe("Layanan AI sedang bermasalah.");
    expect(state.document?.version).toBe(1);

    // "Coba lagi" setelah gagal membuat job baru walau versi lama ada.
    build(scriptedAi([COMPLETE_PRD]));
    expect(prd.startPrd(userId, plan.id)).toEqual({ status: "ready" });
    prd.startPrd(userId, plan.id, { regenerate: true });
    await runner.idle();
    expect(prd.getPrd(userId, plan.id)).toMatchObject({
      status: "ready",
      document: { version: 2 },
    });
  });
});

describe("edit, versi, dan pemulihan", () => {
  async function planWithPrd() {
    const plan = await planWithRoadmap();
    prd.startPrd(userId, plan.id);
    await runner.idle();
    return plan;
  }

  it("simpan menambah versi; isi yang sama tidak menambah versi", async () => {
    const plan = await planWithPrd();
    const v2 = prd.saveDocument(userId, plan.id, "# PRD - Ubah\r\n\nisi baru\n\n\n");
    expect(v2).toMatchObject({ version: 2, content: "# PRD - Ubah\n\nisi baru\n" });
    expect(prd.saveDocument(userId, plan.id, "# PRD - Ubah\n\nisi baru").version).toBe(2);
    expect(prd.listVersions(userId, plan.id).map((v) => v.version)).toEqual([2, 1]);
    expect(prd.getPrd(userId, plan.id).document?.version).toBe(2);
  });

  it("pulihkan menyalin versi lama menjadi versi terbaru tanpa menghapus riwayat", async () => {
    const plan = await planWithPrd();
    const v1 = prd.getVersion(userId, plan.id, 1);
    prd.saveDocument(userId, plan.id, "# PRD - Lain\n");
    const restored = prd.restoreVersion(userId, plan.id, 1);
    expect(restored).toMatchObject({ version: 3, content: v1.content });
    expect(prd.listVersions(userId, plan.id).map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it("versi yang tidak ada → NOT_FOUND; plan orang lain → NOT_FOUND", async () => {
    const plan = await planWithPrd();
    expect(() => prd.getVersion(userId, plan.id, 9)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => prd.saveDocument(otherId, plan.id, "x")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => prd.listVersions(otherId, plan.id)).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });

  it("simpan setelah job gagal mengembalikan status ready", async () => {
    const plan = await planWithPrd();
    build(scriptedAi(["# PRD - X\n"]));
    prd.startPrd(userId, plan.id, { regenerate: true });
    await runner.idle();
    expect(prd.getPrd(userId, plan.id).status).toBe("failed");
    await new Promise((resolve) => setTimeout(resolve, 2));
    prd.saveDocument(userId, plan.id, "# PRD - Perbaikan saya\n");
    expect(prd.getPrd(userId, plan.id)).toMatchObject({
      status: "ready",
      document: { version: 2 },
      job: { error: null },
    });
  });

  it("menolak simpan selama PRD dibuat (409)", async () => {
    const plan = await planWithRoadmap();
    const gate = Promise.withResolvers<void>();
    build(scriptedAi([COMPLETE_PRD], { between: () => gate.promise }));
    prd.startPrd(userId, plan.id);
    expect(() => prd.saveDocument(userId, plan.id, "# PRD - x\n")).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
    gate.resolve();
    await runner.idle();
    expect(prd.saveDocument(userId, plan.id, "# PRD - x\n").version).toBe(2);
  });
});
