import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  estimateAnalysisTokens,
  planAnalysis,
} from "@/features/codebase/ai/analyze.plan";
import { ESTIMATE_CHARS_PER_TOKEN } from "@/features/codebase/limits";
import { DOC_SLUGS } from "@/features/codebase/schemas";
import {
  ANALYZE_JOB,
  type AnalysisService,
  createAnalysisService,
} from "@/features/codebase/server/analyze";
import { createCodebaseRepo } from "@/features/codebase/server/repo";
import {
  type CodebaseService,
  createCodebaseService,
} from "@/features/codebase/server/service";
import {
  createSourceStore,
  type SourceStore,
} from "@/features/codebase/server/source-store";
import type { BudgetStatus } from "@/server/ai";
import {
  type AiClient,
  createAiClient,
  type GenerateStructuredArgs,
} from "@/server/ai/client";
import { databaseUsageRecorder } from "@/server/ai/usage";
import type { LlmConfig } from "@/server/config/env";
import type { DbHandle } from "@/server/db/client";
import { jobs, usage } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createJobRepo, createJobRunner, type JobRunner } from "@/server/jobs";
import { createLogger } from "@/server/logger";
import { createTestDb, seedUser } from "../helpers/test-db";

/** M7-10 / M7-12: job `codebase-analyze` (mode mock), perkiraan biaya, lanjut, batal, usulan. */

const mockLlm: LlmConfig = {
  mode: "mock",
  models: {
    questions: "m",
    roadmap: "m",
    prd: "m",
    spec: "m",
    tasks: "m",
    chat: "m",
    codebase: "mock/codebase",
  },
};
const logger = createLogger({ level: "silent", sink: () => undefined });
const noBudget: BudgetStatus = {
  daily: { spentUsd: 0, limitUsd: null },
  monthly: { spentUsd: 0, limitUsd: null },
};

let handle: DbHandle;
let repo: ReturnType<typeof createCodebaseRepo>;
let store: SourceStore;
let sourceDir: string;
let codebases: CodebaseService;
let runner: JobRunner;
let analysis: AnalysisService;
let userId: string;
let otherId: string;
let model: string;
let budget: BudgetStatus;

function mockAi(checkBudget?: () => void): AiClient {
  return createAiClient({
    llm: mockLlm,
    logger,
    recordUsage: databaseUsageRecorder(handle.db),
    checkBudget,
  });
}

/** Klien yang menyisipkan perilaku sebelum panggilan terstruktur (gagal/berhenti pada prompt tertentu). */
function wrapAi(
  base: AiClient,
  before: (args: GenerateStructuredArgs<unknown>) => void | Promise<void>,
): AiClient {
  return {
    ...base,
    async generateStructured<T>(args: GenerateStructuredArgs<T>) {
      await before(args as GenerateStructuredArgs<unknown>);
      return base.generateStructured(args);
    },
  };
}

function build(ai: AiClient = mockAi()) {
  runner = createJobRunner({ repo: createJobRepo(handle.db), logger });
  analysis = createAnalysisService({
    repo,
    store,
    ai,
    jobs: runner,
    model: () => model,
    budget: () => budget,
    own: codebases.own,
  });
  runner.register(ANALYZE_JOB, analysis.run);
}

beforeEach(() => {
  handle = createTestDb();
  repo = createCodebaseRepo(handle.db);
  sourceDir = mkdtempSync(join(tmpdir(), "piard-analyze-"));
  store = createSourceStore(sourceDir);
  codebases = createCodebaseService(repo, { store, maxUploadBytes: 5 * 1024 * 1024 });
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
  model = "mock/codebase";
  budget = noBudget;
  build();
});
afterEach(async () => {
  await runner.idle();
  handle.close();
  rmSync(sourceDir, { recursive: true, force: true });
});

/** Repo kecil berpotongan banyak: 12 berkas besar (dipotong 6.000 token) → 3 potongan. */
function projectZip(extra: Record<string, string> = {}) {
  const files: Record<string, Uint8Array> = {
    "toko-main/README.md": strToU8("# Toko\nAplikasi toko daring."),
    "toko-main/package.json": strToU8(
      JSON.stringify({ dependencies: { next: "16", react: "19", "drizzle-orm": "1" } }),
    ),
    "toko-main/src/app/page.tsx": strToU8(
      "export default function Page() { return null }",
    ),
  };
  for (let i = 0; i < 12; i += 1) {
    files[`toko-main/src/lib/modul-${String(i).padStart(2, "0")}.ts`] = strToU8(
      `export const nilai${i} = ${i};\n`.repeat(1_400),
    );
  }
  for (const [path, text] of Object.entries(extra))
    files[`toko-main/${path}`] = strToU8(text);
  return zipSync(files);
}

function readyCodebase(zip = projectZip()) {
  const { id } = codebases.create(userId, {
    name: "Toko",
    source: "zip",
    language: "id",
  });
  codebases.receiveZip(userId, id, zip, "toko.zip");
  return id;
}

const promptKind = (args: GenerateStructuredArgs<unknown>) => {
  const prompt = "prompt" in args ? (args.prompt ?? "") : "";
  if (/Potongan \d+ dari/.test(prompt)) return "summary";
  if (/Pohon berkas[\s\S]*Berkas kunci/.test(prompt)) return "profile";
  return "page";
};

describe("perkiraan biaya (M7-12)", () => {
  it("dihitung dari sumber sebelum job; mock = US$0 tanpa konfirmasi", () => {
    const id = readyCodebase();
    const estimate = analysis.estimate(userId, id);
    expect(estimate).toMatchObject({
      model: "mock/codebase",
      costUsd: 0,
      chunks: 3,
      calls: 1 + 3 + DOC_SLUGS.length,
      needsConfirmation: false,
      reasons: [],
    });
    expect(estimate.inputTokens).toBeGreaterThan(18_000);
    expect(runner.get(repo.find(userId, id)?.analysisJobId ?? "")).toBeUndefined();
  });

  it("Haiku dihitung per panggilan; di atas 20% sisa anggaran butuh konfirmasi", () => {
    const id = readyCodebase();
    model = "claude-haiku-5-5";
    const cheap = analysis.estimate(userId, id);
    expect(cheap.costUsd).toBeGreaterThan(0);
    expect(cheap.costUsd).toBeLessThan(0.5);
    expect(cheap.needsConfirmation).toBe(false);

    budget = { ...noBudget, monthly: { spentUsd: 9.99, limitUsd: 10 } };
    const tight = analysis.estimate(userId, id);
    expect(tight.needsConfirmation).toBe(true);
    expect(tight.reasons.map((r) => r.kind)).toEqual(["budget"]);
    expect(tight.reasons[0]?.message).toMatch(/20% sisa anggaran bulanan \(US\$0,01\)/);

    const result = analysis.start(userId, id, { confirmed: false });
    expect(result.started).toBe(false);
    expect(repo.find(userId, id)?.status).toBe("source_ready");
    expect(analysis.start(userId, id, { confirmed: true }).started).toBe(true);
  });

  it("model OpenRouter: harga belum diketahui → selalu minta konfirmasi", () => {
    const id = readyCodebase();
    model = "anthropic/claude-haiku-5.5";
    const estimate = analysis.estimate(userId, id);
    expect(estimate.costUsd).toBeNull();
    expect(estimate.reasons.map((r) => r.kind)).toEqual(["unknown_price"]);
  });

  it("perkiraan per panggilan ≈ aktual (profil, ringkasan); halaman = batas atas", async () => {
    const id = readyCodebase();
    const row = repo.find(userId, id);
    const files = store.load(id);
    if (!row || !files) throw new Error("sumber tidak ada");
    const estimate = estimateAnalysisTokens(planAnalysis(files), {
      name: row.name,
      language: row.language,
      stack: row.detectedStack,
    });
    // Ukuran prompt direkam per panggilan beserta jenisnya (urutan baris `usage` bisa seri).
    const sent: { kind: string; tokens: number }[] = [];
    build(
      wrapAi(mockAi(), (args) => {
        const text = `${args.system ?? ""}${"prompt" in args ? (args.prompt ?? "") : ""}`;
        sent.push({
          kind: promptKind(args),
          tokens: Math.ceil(text.length / ESTIMATE_CHARS_PER_TOKEN),
        });
      }),
    );
    analysis.start(userId, id, { confirmed: false });
    await runner.idle();
    expect(
      handle.db.select().from(usage).where(eq(usage.kind, "codebase")).all(),
    ).toHaveLength(estimate.calls);
    const of = (kind: string) => sent.filter((c) => c.kind === kind).map((c) => c.tokens);
    const actualIn = [...of("profile"), ...of("summary"), ...of("page")];
    expect(actualIn).toHaveLength(estimate.calls);
    const est = estimate.perCall.map((c) => c.inputTokens);
    // Profil: masukannya sudah pasti (pohon + berkas kunci) → hampir sama persis.
    expect(Math.abs((est[0] ?? 0) - (actualIn[0] ?? 0))).toBeLessThan(50);
    // Ringkasan: hanya profil pengganti yang berbeda → dalam 5%.
    for (let i = 1; i <= 3; i += 1) {
      expect(
        Math.abs((est[i] ?? 0) - (actualIn[i] ?? 0)) / (actualIn[i] ?? 1),
      ).toBeLessThan(0.05);
    }
    // Halaman bergantung panjang ringkasan model: perkiraan konservatif, tidak pernah di bawah aktual.
    // Ringkasan mock jauh lebih pendek dari ringkasan Haiku, jadi pembanding nyata ada di eval M7-11.
    const pagesEst = est.slice(4).reduce((a, b) => a + b, 0);
    const pagesActual = actualIn.slice(4).reduce((a, b) => a + b, 0);
    expect(pagesEst).toBeGreaterThanOrEqual(pagesActual);
  });

  it("tanpa sumber atau milik orang lain ditolak", () => {
    const { id } = codebases.create(userId, {
      name: "Kosong",
      source: "zip",
      language: "id",
    });
    expect(() => analysis.estimate(userId, id)).toThrow(
      /Sumber kode sudah tidak tersedia/,
    );
    const ready = readyCodebase();
    expect(() => analysis.estimate(otherId, ready)).toThrow(AppError);
  });
});

describe("job codebase-analyze (M7-10)", () => {
  it("menghasilkan 10 halaman origin=ai, status ready, sumber dihapus, pemakaian tercatat", async () => {
    const id = readyCodebase();
    const files = store.load(id);
    if (!files) throw new Error("sumber tidak ada");
    const started = analysis.start(userId, id, { confirmed: false });
    expect(started.started).toBe(true);
    expect(repo.find(userId, id)?.status).toBe("analyzing");
    await runner.idle();

    const row = repo.find(userId, id);
    expect(row?.status).toBe("ready");
    expect(row?.analyzedAt).toBeInstanceOf(Date);
    const docs = codebases.listDocs(userId, id);
    expect(docs.map((d) => d.slug)).toEqual([...DOC_SLUGS]);
    expect(docs.every((d) => d.origin === "ai" && d.version === 1)).toBe(true);
    expect(codebases.getDoc(userId, id, "arsitektur").page.content).toMatch(
      /```mermaid\nflowchart TD/,
    );
    // Sumber dan hasil antara tidak tersisa.
    expect(readdirSync(sourceDir)).toEqual([]);
    // Berkas yang dipotong tetap diketahui setelah sumbernya dihapus (panel samping, M7-14).
    const plan = planAnalysis(files);
    expect(row?.analysisSummary).toMatchObject({
      truncatedFiles: plan.truncated.length,
      droppedFiles: plan.dropped.length,
    });
    expect(plan.truncated.length).toBeGreaterThan(0);

    const jobId = row?.analysisJobId ?? "";
    const rows = handle.db
      .select()
      .from(usage)
      .where(and(eq(usage.refId, jobId), eq(usage.kind, "codebase")))
      .all();
    expect(rows.length).toBe(1 + 3 + DOC_SLUGS.length);
    expect(rows.every((r) => r.planId === null && r.userId === userId)).toBe(true);
    expect(analysis.status(userId, id)).toMatchObject({
      status: "ready",
      job: { state: "succeeded", phase: "done", done: 10, total: 10 },
    });
  });

  it("gagal sebagian menyimpan hasil; Coba lagi melanjutkan tanpa mengulang langkah selesai", async () => {
    const id = readyCodebase();
    let failOnce = true;
    const calls: string[] = [];
    build(
      wrapAi(mockAi(), (args) => {
        const kind = promptKind(args);
        const prompt = "prompt" in args ? (args.prompt ?? "") : "";
        calls.push(kind);
        if (failOnce && /Potongan 2 dari 3/.test(prompt)) {
          failOnce = false;
          throw new AppError("UPSTREAM_AI", "Model sedang sibuk. Coba lagi.");
        }
      }),
    );
    analysis.start(userId, id, { confirmed: false });
    await runner.idle();

    expect(analysis.status(userId, id)).toMatchObject({
      status: "failed",
      error: "Model sedang sibuk. Coba lagi.",
      job: { state: "failed" },
    });
    expect(codebases.listDocs(userId, id)).toEqual([]);
    // Sumber tetap ada untuk dilanjutkan.
    expect(existsSync(join(sourceDir, `${id}.json`))).toBe(true);
    expect(existsSync(join(sourceDir, `${id}.work.json`))).toBe(true);

    calls.length = 0;
    analysis.retry(userId, id);
    await runner.idle();
    expect(repo.find(userId, id)?.status).toBe("ready");
    // Profil dan dua ringkasan yang sudah selesai tidak diulang.
    expect(calls.filter((c) => c === "profile")).toHaveLength(0);
    expect(calls.filter((c) => c === "summary")).toHaveLength(1);
    expect(calls.filter((c) => c === "page")).toHaveLength(DOC_SLUGS.length);
  });

  it("melanjutkan dari halaman yang sudah ditulis setelah proses mati", async () => {
    const id = readyCodebase();
    let pages = 0;
    build(
      wrapAi(mockAi(), (args) => {
        if (promptKind(args) === "page" && ++pages === 5) {
          throw new AppError("UPSTREAM_AI", "Server mati di tengah jalan.");
        }
      }),
    );
    analysis.start(userId, id, { confirmed: false });
    await runner.idle();
    const written = codebases.listDocs(userId, id).length;
    expect(written).toBeGreaterThanOrEqual(1);
    expect(written).toBeLessThan(DOC_SLUGS.length);

    // "Proses baru": service dan runner baru di atas database dan folder yang sama.
    const calls: string[] = [];
    build(wrapAi(mockAi(), (args) => void calls.push(promptKind(args))));
    analysis.retry(userId, id);
    await runner.idle();
    expect(codebases.listDocs(userId, id)).toHaveLength(DOC_SLUGS.length);
    expect(calls.filter((c) => c === "page")).toHaveLength(DOC_SLUGS.length - written);
    // Halaman yang sudah ditulis tidak mendapat versi kedua.
    expect(codebases.listDocs(userId, id).every((d) => d.version === 1)).toBe(true);
  });

  it("Batalkan menghentikan job, menghapus sumber, dan tidak ada tulisan sesudahnya", async () => {
    const id = readyCodebase();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached: () => void = () => undefined;
    const atSummary = new Promise<void>((resolve) => {
      reached = resolve;
    });
    build(
      wrapAi(mockAi(), async (args) => {
        if (promptKind(args) === "summary") {
          reached();
          await gate;
        }
      }),
    );
    analysis.start(userId, id, { confirmed: false });
    await atSummary;
    const cancelled = analysis.cancel(userId, id);
    expect(cancelled.status).toBe("awaiting_source");
    expect(cancelled.error).toMatch(/dibatalkan/);
    release();
    await runner.idle();

    expect(readdirSync(sourceDir)).toEqual([]);
    expect(codebases.listDocs(userId, id)).toEqual([]);
    expect(repo.find(userId, id)?.status).toBe("awaiting_source");
    const job = handle.db.select().from(jobs).where(eq(jobs.kind, ANALYZE_JOB)).get();
    expect(job?.state).toBe("cancelled");
  });

  it("menghapus proyek saat analisis berjalan menghentikan job tanpa tulisan sesudahnya", async () => {
    const id = readyCodebase();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached: () => void = () => undefined;
    const atSummary = new Promise<void>((resolve) => {
      reached = resolve;
    });
    build(
      wrapAi(mockAi(), async (args) => {
        if (promptKind(args) === "summary") {
          reached();
          await gate;
        }
      }),
    );
    // Service codebase yang tahu cara membatalkan job (seperti instance produksi).
    const withJobs = createCodebaseService(repo, {
      store,
      maxUploadBytes: 5 * 1024 * 1024,
      cancelJob: (jobId) => void runner.cancel(jobId),
    });
    analysis.start(userId, id, { confirmed: false });
    await atSummary;
    withJobs.delete(userId, id);
    release();
    await runner.idle();

    expect(repo.find(userId, id)).toBeUndefined();
    expect(readdirSync(sourceDir)).toEqual([]);
    const job = handle.db.select().from(jobs).where(eq(jobs.kind, ANALYZE_JOB)).get();
    expect(job?.state).toBe("cancelled");
  });

  it("halaman yang diedit manual tidak ditimpa: hasil baru menjadi usulan", async () => {
    const id = readyCodebase();
    analysis.start(userId, id, { confirmed: false });
    await runner.idle();
    repo.addDocVersions(id, [
      {
        slug: "ringkasan",
        title: "Ringkasan",
        content: "Ditulis tangan.",
        origin: "manual",
      },
    ]);

    codebases.receiveZip(
      userId,
      id,
      projectZip({ "src/baru.ts": "export const x = 1" }),
      "v2.zip",
    );
    analysis.start(userId, id, { confirmed: false });
    await runner.idle();

    const ringkasan = codebases.getDoc(userId, id, "ringkasan");
    expect(ringkasan.page).toMatchObject({
      content: "Ditulis tangan.",
      origin: "manual",
    });
    const proposal = repo.findProposal(id, "ringkasan");
    expect(proposal).toMatchObject({ origin: "ai", baseVersion: 2 });
    expect(proposal?.content).toMatch(/Toko adalah proyek/);
    // Halaman lain yang isinya berubah mendapat versi baru, bukan usulan.
    expect(codebases.getDoc(userId, id, "struktur-folder").page.version).toBe(2);
    expect(repo.findProposal(id, "struktur-folder")).toBeUndefined();
    const summary = codebases.get(userId, id).analysisSummary;
    expect(summary?.origin).toBe("ai");
    expect(summary?.proposed).toEqual(["ringkasan"]);
    expect(summary?.changed).toContain("struktur-folder");
    expect(summary?.added).toEqual([]);
  });

  it("batas biaya menghentikan job dengan pesan jelas", async () => {
    const id = readyCodebase();
    build(
      mockAi(() => {
        throw new AppError("BUDGET_EXCEEDED", "Batas biaya bulanan tercapai.");
      }),
    );
    analysis.start(userId, id, { confirmed: false });
    await runner.idle();
    expect(analysis.status(userId, id)).toMatchObject({
      status: "failed",
      error: "Batas biaya bulanan tercapai.",
    });
  });

  it("menolak mulai saat berjalan, Coba lagi tanpa gagal, Batalkan tanpa job", async () => {
    const id = readyCodebase();
    expect(() => analysis.retry(userId, id)).toThrow(/Tidak ada analisis gagal/);
    expect(() => analysis.cancel(userId, id)).toThrow(/Tidak ada analisis/);
    analysis.start(userId, id, { confirmed: false });
    expect(() => analysis.start(userId, id, { confirmed: true })).toThrow(
      /sedang berjalan/,
    );
    await runner.idle();
  });

  it("status gagal bila job berhenti tanpa memperbarui codebase (mis. batas percobaan)", async () => {
    const id = readyCodebase();
    // Job untuk codebase lain yang tidak ada: selesai tanpa menyentuh apa pun, lalu dibuat "gagal".
    const job = runner.enqueue({
      kind: ANALYZE_JOB,
      payload: { userId, codebaseId: "hilang" },
    });
    await runner.idle();
    handle.db
      .update(jobs)
      .set({ state: "failed", error: "Berhenti." })
      .where(eq(jobs.id, job.id))
      .run();
    repo.update(userId, id, { status: "analyzing", analysisJobId: job.id });
    expect(analysis.status(userId, id)).toMatchObject({
      status: "failed",
      error: "Berhenti.",
    });
    expect(repo.find(userId, id)?.status).toBe("failed");
  });
});
