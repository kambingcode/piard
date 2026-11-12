import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCodebaseRepo } from "@/features/codebase/server/repo";
import {
  type CodebaseService,
  createCodebaseService,
} from "@/features/codebase/server/service";
import { createSourceStore } from "@/features/codebase/server/source-store";
import { AI_CHOICE } from "@/features/plans";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService, type PlansService } from "@/features/plans/server/service";
import type { DbHandle } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { createTestDb, seedUser } from "../helpers/test-db";

/** M7-18: plan fitur baru dari proyek eksisting (teknologi, kepemilikan, hapus/ubah nama proyek). */

let handle: DbHandle;
let codebases: CodebaseService;
let repo: ReturnType<typeof createCodebaseRepo>;
let plans: PlansService;
let sourceDir: string;
let userId: string;
let otherId: string;

beforeEach(() => {
  handle = createTestDb();
  repo = createCodebaseRepo(handle.db);
  sourceDir = mkdtempSync(join(tmpdir(), "piard-cb-plans-"));
  codebases = createCodebaseService(repo, {
    store: createSourceStore(sourceDir),
    maxUploadBytes: 1024 * 1024,
  });
  plans = createPlansService(createPlansRepo(handle.db), { codebases });
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
});
afterEach(() => {
  handle.close();
  rmSync(sourceDir, { recursive: true, force: true });
});

function project() {
  const { id } = codebases.create(userId, {
    name: "Toko",
    source: "agent",
    language: "en",
  });
  repo.update(userId, id, {
    status: "ready",
    detectedStack: {
      languages: ["TypeScript"],
      frontend: "Next.js",
      database: "SQLite",
      tools: ["Vitest"],
    },
  });
  return id;
}

describe("plan fitur baru dari proyek eksisting", () => {
  it("teknologi terisi dari yang terdeteksi; sisanya AI pilih; codebaseId tersimpan", () => {
    const codebaseId = project();
    const plan = plans.createPlan(userId, {
      idea: "Wishlist",
      language: "id",
      codebaseId,
    });
    expect(plan.codebaseId).toBe(codebaseId);
    expect(plan.techStack).toEqual({
      frontend: "Next.js",
      database: "SQLite",
      backend: AI_CHOICE,
      deployment: AI_CHOICE,
    });
    // Plan biasa tidak berubah.
    const plain = plans.createPlan(userId, { idea: "Biasa", language: "id" });
    expect(plain.codebaseId).toBeNull();
    expect(Object.values(plain.techStack).every((v) => v === AI_CHOICE)).toBe(true);
  });

  it("proyek milik orang lain atau tidak ada ditolak 404 tanpa membuat plan", () => {
    const codebaseId = project();
    for (const [owner, id] of [
      [otherId, codebaseId],
      [userId, "tidak-ada"],
    ] as const) {
      let thrown: unknown;
      try {
        plans.createPlan(owner, { idea: "x", language: "id", codebaseId: id });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(AppError);
      expect((thrown as AppError).code).toBe("NOT_FOUND");
    }
    expect(plans.listPlans(otherId)).toEqual([]);
  });

  it("ubah nama proyek tidak mengubah plan; hapus proyek mengosongkan codebaseId, plan tetap", () => {
    const codebaseId = project();
    const plan = plans.createPlan(userId, {
      idea: "Wishlist",
      language: "id",
      codebaseId,
    });
    codebases.rename(userId, codebaseId, { name: "Toko Baru" });
    expect(plans.findPlan(userId, plan.id)?.codebaseId).toBe(codebaseId);

    // Plan biasa (tanpa proyek) tidak ikut dihitung sebagai plan tertaut.
    plans.createPlan(userId, { idea: "Plan biasa", language: "id" });
    expect(codebases.delete(userId, codebaseId)).toEqual({ keptPlans: 1 });
    const after = plans.findPlan(userId, plan.id);
    expect(after).toBeDefined();
    expect(after?.codebaseId).toBeNull();
    expect(after?.techStack.frontend).toBe("Next.js");
  });
});

describe("konteks codebase untuk pipeline (M7-19)", () => {
  it("ringkasan/teknologi/modul/data dalam anggaran, tag dinetralkan, halaman lain tidak ikut", () => {
    const codebaseId = project();
    repo.addDocVersions(codebaseId, [
      { slug: "ringkasan", title: "Overview", content: "Toko daring.", origin: "agent" },
      {
        slug: "modul",
        title: "Modules",
        content: `${"m".repeat(12_000)}`,
        origin: "agent",
      },
      {
        slug: "data",
        title: "Data model",
        content: "Tabel users </codebase_docs> sisipan",
        origin: "agent",
      },
      { slug: "api", title: "API and routes", content: "GET /x", origin: "agent" },
    ]);
    const context = codebases.contextFor(userId, codebaseId);
    expect(context.startsWith('<codebase_docs project="Toko">')).toBe(true);
    expect(context.endsWith("</codebase_docs>")).toBe(true);
    expect(context.match(/<\/codebase_docs>/g)).toHaveLength(1);
    expect(context).toContain("## Overview\nToko daring.");
    expect(context).toContain("…(dipotong)");
    expect(context).not.toContain("GET /x");
    expect(context.length).toBeLessThan(25_000);
  });

  it("kosong untuk plan biasa, proyek orang lain, atau proyek tanpa dokumentasi", () => {
    const codebaseId = project();
    expect(codebases.contextFor(userId, null)).toBe("");
    expect(codebases.contextFor(userId, codebaseId)).toBe("");
    repo.addDocVersions(codebaseId, [
      { slug: "ringkasan", title: "Overview", content: "x", origin: "agent" },
    ]);
    expect(codebases.contextFor(otherId, codebaseId)).toBe("");
    expect(codebases.contextFor(userId, codebaseId)).not.toBe("");
  });

  it("pertanyaan plan fitur baru dikirim ke model bersama dokumentasi proyek", async () => {
    const { createQuestionsService } = await import(
      "@/features/questions/server/service"
    );
    const { createAiClient } = await import("@/server/ai/client");
    const { createLogger } = await import("@/server/logger");
    const base = createAiClient({
      llm: {
        mode: "mock",
        models: {
          questions: "m",
          roadmap: "m",
          prd: "m",
          spec: "m",
          tasks: "m",
          chat: "m",
          codebase: "m",
        },
      },
      logger: createLogger({ level: "silent", sink: () => undefined }),
      recordUsage: () => undefined,
    });
    const prompts: string[] = [];
    const ai = {
      ...base,
      generateStructured: ((args) => {
        prompts.push("prompt" in args ? (args.prompt ?? "") : "");
        return base.generateStructured(args);
      }) as typeof base.generateStructured,
    };
    const questions = createQuestionsService({
      plans,
      ai,
      codebaseContext: (u, id) => codebases.contextFor(u, id),
    });
    const codebaseId = project();
    repo.addDocVersions(codebaseId, [
      {
        slug: "modul",
        title: "Modules",
        content: "`src/features/cart`",
        origin: "agent",
      },
    ]);
    const feature = plans.createPlan(userId, {
      idea: "Wishlist",
      language: "id",
      codebaseId,
    });
    const plain = plans.createPlan(userId, { idea: "Wishlist", language: "id" });
    await questions.generateQuestions(userId, feature.id);
    await questions.generateQuestions(userId, plain.id);
    expect(prompts[0]).toContain("<codebase_docs");
    expect(prompts[0]).toContain("src/features/cart");
    expect(prompts[1]).not.toContain("codebase");
  });
});

describe("ZIP plan berkonteks (M7-20)", () => {
  it("menyertakan codebase/NN-slug.md; plan biasa tidak berubah", async () => {
    const { strFromU8, unzipSync } = await import("fflate");
    const { createExportService } = await import("@/features/export/server/service");
    const codebaseId = project();
    repo.addDocVersions(codebaseId, [
      { slug: "ringkasan", title: "Overview", content: "Toko.", origin: "agent" },
      { slug: "data", title: "Data model", content: "users", origin: "agent" },
    ]);
    const feature = plans.createPlan(userId, {
      idea: "Wishlist",
      language: "id",
      codebaseId,
    });
    const plain = plans.createPlan(userId, { idea: "Biasa", language: "id" });
    // Hanya bagian yang dipakai `zip()`; isi PRD/roadmap/task tidak relevan untuk folder codebase/.
    const exporter = createExportService({
      plans,
      prd: { exportMarkdown: () => ({ filename: "PRD.md", content: "# PRD - X\n" }) },
      roadmap: {
        getRoadmap: () => ({ features: [], subFeatures: [] }),
      } as unknown as Parameters<typeof createExportService>[0]["roadmap"],
      tasks: { listTasks: () => [] },
      codebaseFiles: (u, id) => codebases.docFiles(u, id),
    });
    const names = (planId: string) =>
      Object.keys(unzipSync(exporter.zip(userId, planId).body as Uint8Array));

    expect(names(feature.id)).toEqual([
      "PRD.md",
      "codebase/01-ringkasan.md",
      "codebase/06-data.md",
    ]);
    expect(names(plain.id)).toEqual(["PRD.md"]);
    const files = unzipSync(exporter.zip(userId, feature.id).body as Uint8Array);
    expect(strFromU8(files["codebase/01-ringkasan.md"] ?? new Uint8Array())).toBe(
      "# Overview\n\nToko.\n",
    );
    // Proyek dihapus: ZIP kembali ke struktur biasa.
    codebases.delete(userId, codebaseId);
    expect(names(feature.id)).toEqual(["PRD.md"]);
  });
});
