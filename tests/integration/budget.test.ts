import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type BudgetLimits, createBudgetGuard } from "@/server/ai/budget";
import { type ChatEvent, createAiClient } from "@/server/ai/client";
import { blocksFurtherCalls } from "@/server/ai/errors";
import { databaseUsageRecorder } from "@/server/ai/usage";
import type { LlmConfig } from "@/server/config/env";
import type { DbHandle } from "@/server/db/client";
import { usage } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createJobRepo, createJobRunner } from "@/server/jobs";
import { createLogger } from "@/server/logger";
import { createTestDb, seedUser } from "../helpers/test-db";

const logger = createLogger({ level: "silent", sink: () => undefined });
const NOW = new Date(2026, 9, 15, 10, 0); // 15 Okt 2026 10.00 waktu lokal

let handle: DbHandle;
let userId: string;

beforeEach(() => {
  handle = createTestDb();
  userId = seedUser(handle.db).id;
});
afterEach(() => handle.close());

function spend(costUsd: number, createdAt: Date) {
  handle.db
    .insert(usage)
    .values({ userId, kind: "prd", model: "m", costUsd, createdAt })
    .run();
}

function guard(limits: BudgetLimits) {
  return createBudgetGuard({ db: handle.db, limits: () => limits, now: () => NOW });
}

function budgetError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("tidak melempar");
}

describe("penjaga batas biaya", () => {
  it("tanpa batas tidak pernah menolak", () => {
    spend(1000, NOW);
    expect(() =>
      guard({ dailyUsd: null, monthlyUsd: null }).assertAvailable(),
    ).not.toThrow();
  });

  it("menghitung hari ini dan bulan ini saja", () => {
    spend(1, new Date(2026, 9, 15, 0, 5)); // hari ini
    spend(2, new Date(2026, 9, 14, 23, 55)); // kemarin, bulan ini
    spend(4, new Date(2026, 8, 30, 12, 0)); // bulan lalu
    expect(guard({ dailyUsd: 5, monthlyUsd: 10 }).status()).toEqual({
      daily: { spentUsd: 1, limitUsd: 5 },
      monthly: { spentUsd: 3, limitUsd: 10 },
    });
  });

  it("menolak saat batas bulanan tercapai dan menyebut tempat menaikkannya", () => {
    spend(10, new Date(2026, 9, 2));
    const error = budgetError(() =>
      guard({ dailyUsd: null, monthlyUsd: 10 }).assertAvailable(),
    );
    expect(error.code).toBe("BUDGET_EXCEEDED");
    expect(error.status).toBe(429);
    expect(error.message).toContain("batas bulanan di halaman Pengaturan");
  });

  it("menolak saat batas harian tercapai, tetapi pengeluaran kemarin tidak dihitung", () => {
    spend(3, new Date(2026, 9, 14, 20, 0));
    const daily = guard({ dailyUsd: 2, monthlyUsd: null });
    expect(() => daily.assertAvailable()).not.toThrow();
    spend(2, new Date(2026, 9, 15, 9, 0));
    expect(budgetError(() => daily.assertAvailable()).message).toContain(
      "batas harian di halaman Pengaturan",
    );
  });

  it("batas yang diubah berlaku tanpa membuat penjaga baru", () => {
    spend(5, NOW);
    let limits: BudgetLimits = { dailyUsd: null, monthlyUsd: 5 };
    const live = createBudgetGuard({
      db: handle.db,
      limits: () => limits,
      now: () => NOW,
    });
    expect(() => live.assertAvailable()).toThrow(AppError);
    limits = { dailyUsd: null, monthlyUsd: 20 };
    expect(() => live.assertAvailable()).not.toThrow();
  });

  it("galatnya menghentikan job yang memanggil model berulang kali", () => {
    expect(blocksFurtherCalls(new AppError("BUDGET_EXCEEDED", "habis"))).toBe(true);
    expect(blocksFurtherCalls(new AppError("UPSTREAM_AI", "lain"))).toBe(false);
  });
});

describe("klien AI dengan batas biaya", () => {
  const llm: LlmConfig = {
    mode: "mock",
    models: {
      questions: "mock/q",
      roadmap: "mock/r",
      prd: "mock/p",
      spec: "mock/s",
      tasks: "mock/t",
      chat: "mock/c",
      codebase: "mock/cb",
    },
  };
  const exceeded = () => {
    throw new AppError("BUDGET_EXCEEDED", "Batas tercapai.");
  };
  const client = (checkBudget: () => void) =>
    createAiClient({
      llm,
      logger,
      recordUsage: databaseUsageRecorder(handle.db),
      checkBudget,
    });
  const usageCount = () => handle.db.select().from(usage).all().length;

  it("tidak memanggil model maupun mencatat biaya saat ditolak", async () => {
    const ai = client(exceeded);
    await expect(
      ai.generateStructured({
        task: "questions",
        userId,
        prompt: "p",
        schema: z.object({ n: z.number() }),
        mock: () => ({ n: 1 }),
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    await expect(
      ai.streamStructured({
        task: "roadmap",
        userId,
        prompt: "p",
        schema: z.object({ n: z.number() }),
        mock: () => ({ n: 1 }),
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(usageCount()).toBe(0);
  });

  it("aliran teks dan chat gagal sejak awal dengan galat yang sama", async () => {
    const ai = client(exceeded);
    const text = ai.streamText({ task: "prd", userId, prompt: "p", mock: "isi" });
    await expect(text.completed).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    await expect(async () => {
      for await (const _ of text.textStream) {
        // tidak boleh ada potongan
      }
    }).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });

    const chat = ai.streamChat({
      task: "chat",
      userId,
      prompt: "halo",
      tools: {},
      mock: () => [{ text: "hai" }],
    });
    const seen: ChatEvent[] = [];
    await expect(async () => {
      for await (const event of chat.events) seen.push(event);
    }).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    await expect(chat.completed).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(seen).toEqual([]);
    expect(usageCount()).toBe(0);
  });

  it("berjalan normal saat masih di bawah batas", async () => {
    const ai = client(() => undefined);
    const { data } = await ai.generateStructured({
      task: "questions",
      userId,
      prompt: "p",
      schema: z.object({ n: z.number() }),
      mock: () => ({ n: 1 }),
    });
    expect(data).toEqual({ n: 1 });
    expect(usageCount()).toBe(1);
  });
});

describe("antrean job dengan batas biaya", () => {
  function runner(admit: () => void) {
    const jobs = createJobRunner({ repo: createJobRepo(handle.db), logger, admit });
    jobs.register("ai", async () => {
      throw new AppError("UPSTREAM_AI", "gagal");
    });
    return jobs;
  }

  it("menolak job baru tanpa menyimpannya", () => {
    const jobs = runner(() => {
      throw new AppError("BUDGET_EXCEEDED", "Batas tercapai.");
    });
    expect(() => jobs.enqueue({ kind: "ai" })).toThrow("Batas tercapai.");
    expect(createJobRepo(handle.db).listByState("queued")).toEqual([]);
  });

  it("job aktif yang sama tetap dikembalikan (klik ganda bukan job baru)", () => {
    let open = true;
    const jobs = runner(() => {
      if (!open) throw new AppError("BUDGET_EXCEEDED", "Batas tercapai.");
    });
    const first = jobs.enqueue({ kind: "ai", payload: { a: 1 } });
    open = false;
    expect(jobs.enqueue({ kind: "ai", payload: { a: 1 } }).id).toBe(first.id);
  });

  it("menolak 'Coba lagi' setelah batas tercapai", async () => {
    let open = true;
    const jobs = runner(() => {
      if (!open) throw new AppError("BUDGET_EXCEEDED", "Batas tercapai.");
    });
    const job = jobs.enqueue({ kind: "ai" });
    await jobs.idle();
    expect(jobs.get(job.id)?.state).toBe("failed");
    open = false;
    expect(() => jobs.retry(job.id)).toThrow("Batas tercapai.");
    expect(jobs.get(job.id)?.state).toBe("failed");
  });
});
