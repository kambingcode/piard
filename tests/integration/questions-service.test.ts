import { desc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService, type PlansService } from "@/features/plans/server/service";
import {
  createQuestionsService,
  type QuestionsService,
} from "@/features/questions/server/service";
import { type AiClient, createAiClient } from "@/server/ai/client";
import { databaseUsageRecorder } from "@/server/ai/usage";
import type { LlmConfig } from "@/server/config/env";
import type { DbHandle } from "@/server/db/client";
import { usage } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createLogger } from "@/server/logger";
import { createTestDb, seedUser } from "../helpers/test-db";

const mockLlm: LlmConfig = {
  mode: "mock",
  models: {
    questions: "mock/questions",
    roadmap: "m",
    prd: "m",
    spec: "m",
    tasks: "m",
    chat: "m",
    codebase: "m",
  },
};

let handle: DbHandle;
let plans: PlansService;
let ai: AiClient;
let questions: QuestionsService;
let userId: string;

beforeEach(() => {
  handle = createTestDb();
  plans = createPlansService(createPlansRepo(handle.db));
  ai = createAiClient({
    llm: mockLlm,
    logger: createLogger({ level: "silent", sink: () => undefined }),
    recordUsage: databaseUsageRecorder(handle.db),
  });
  questions = createQuestionsService({ plans, ai });
  userId = seedUser(handle.db).id;
});
afterEach(() => handle.close());

const usageRows = () =>
  handle.db.select().from(usage).orderBy(desc(usage.createdAt)).all();

describe("generateQuestions", () => {
  it("menyimpan 5 pertanyaan pada plan dan mencatat pemakaian", async () => {
    const plan = plans.createPlan(userId, { idea: "Booking klinik", language: "id" });
    expect(await questions.generateQuestions(userId, plan.id)).toBe(true);

    const saved = plans.getPlan(userId, plan.id).plan.questionAnswers;
    expect(saved.questions).toHaveLength(5);
    expect(saved.questions.map((q) => q.type)).toContain("multi_choice");
    expect(saved.answers).toEqual({});
    expect(usageRows()).toMatchObject([{ kind: "questions", planId: plan.id, userId }]);
  });

  it("memakai bahasa plan", async () => {
    const plan = plans.createPlan(userId, { idea: "Expense tracker", language: "en" });
    await questions.generateQuestions(userId, plan.id);
    expect(
      plans.getPlan(userId, plan.id).plan.questionAnswers.questions[0]?.question,
    ).toMatch(/Describe/);
  });

  it("idempoten: panggilan kedua tidak memanggil AI lagi", async () => {
    const plan = plans.createPlan(userId, { idea: "x", language: "id" });
    await questions.generateQuestions(userId, plan.id);
    expect(await questions.generateQuestions(userId, plan.id)).toBe(false);
    expect(usageRows()).toHaveLength(1);
  });

  it("regenerate membuat ulang dan menghapus jawaban lama", async () => {
    const plan = plans.createPlan(userId, { idea: "x", language: "id" });
    await questions.generateQuestions(userId, plan.id);
    plans.updatePlan(userId, plan.id, {
      questionAnswers: { answers: { real_user_pain: "Dewi" } },
    });

    expect(await questions.generateQuestions(userId, plan.id, { regenerate: true })).toBe(
      true,
    );
    expect(plans.getPlan(userId, plan.id).plan.questionAnswers.answers).toEqual({});
    expect(usageRows()).toHaveLength(2);
  });

  it("permintaan bersamaan untuk plan yang sama hanya memanggil AI sekali", async () => {
    const plan = plans.createPlan(userId, { idea: "x", language: "id" });
    const slowAi: AiClient = {
      ...ai,
      generateStructured: async (args) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return ai.generateStructured(args);
      },
    };
    const spy = vi.spyOn(slowAi, "generateStructured");
    const service = createQuestionsService({ plans, ai: slowAi });

    const results = await Promise.all([
      service.generateQuestions(userId, plan.id),
      service.generateQuestions(userId, plan.id),
      service.generateQuestions(userId, plan.id),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(results).toEqual([true, true, true]);
    expect(usageRows()).toHaveLength(1);

    // Setelah selesai, permintaan berikutnya normal lagi (tidak ada kunci yang tertinggal).
    expect(await service.generateQuestions(userId, plan.id)).toBe(false);
  });

  it("pengguna lain tidak bisa menumpang hasil permintaan yang sedang berjalan", async () => {
    const other = seedUser(handle.db, "lain@piard.local").id;
    const plan = plans.createPlan(userId, { idea: "x", language: "id" });
    const slowAi: AiClient = {
      ...ai,
      generateStructured: async (args) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return ai.generateStructured(args);
      },
    };
    const service = createQuestionsService({ plans, ai: slowAi });
    const owner = service.generateQuestions(userId, plan.id);
    await expect(service.generateQuestions(other, plan.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await owner).toBe(true);
  });

  it("galat AI tidak mengunci permintaan berikutnya", async () => {
    const plan = plans.createPlan(userId, { idea: "x", language: "id" });
    let fail = true;
    const flaky: AiClient = {
      ...ai,
      generateStructured: async (args) => {
        if (fail) throw new AppError("UPSTREAM_AI", "gagal");
        return ai.generateStructured(args);
      },
    };
    const service = createQuestionsService({ plans, ai: flaky });
    await expect(service.generateQuestions(userId, plan.id)).rejects.toMatchObject({
      code: "UPSTREAM_AI",
    });
    fail = false;
    expect(await service.generateQuestions(userId, plan.id)).toBe(true);
  });

  it("menolak plan milik orang lain tanpa memanggil AI", async () => {
    const other = seedUser(handle.db, "lain@piard.local").id;
    const plan = plans.createPlan(userId, { idea: "x", language: "id" });
    const spy = vi.spyOn(ai, "generateStructured");
    await expect(questions.generateQuestions(other, plan.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("meneruskan galat AI sebagai UPSTREAM_AI dan tidak mengubah plan", async () => {
    const plan = plans.createPlan(userId, { idea: "x", language: "id" });
    const failing: AiClient = {
      ...ai,
      generateStructured: async () => {
        throw new AppError("UPSTREAM_AI", "Layanan AI sedang bermasalah.");
      },
    };
    const service = createQuestionsService({ plans, ai: failing });
    await expect(service.generateQuestions(userId, plan.id)).rejects.toMatchObject({
      code: "UPSTREAM_AI",
    });
    expect(plans.getPlan(userId, plan.id).plan.questionAnswers.questions).toEqual([]);
  });
});
