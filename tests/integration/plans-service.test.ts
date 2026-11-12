import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClarifyingQuestion } from "@/features/plans";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService, type PlansService } from "@/features/plans/server/service";
import type { DbHandle } from "@/server/db/client";
import { workspaces } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createTestDb, seedUser } from "../helpers/test-db";

let handle: DbHandle;
let service: PlansService;
let userId: string;

const QUESTIONS: ClarifyingQuestion[] = [
  { id: "pain", question: "Siapa?", type: "text", options: [], required: true },
  {
    id: "win",
    question: "Apa?",
    type: "single_choice",
    options: ["a", "b", "c"],
    required: true,
  },
  {
    id: "must",
    question: "Mana?",
    type: "multi_choice",
    options: ["x", "y", "z"],
    required: true,
  },
];

beforeEach(() => {
  handle = createTestDb();
  service = createPlansService(createPlansRepo(handle.db));
  userId = seedUser(handle.db).id;
});
afterEach(() => handle.close());

async function expectAppError(run: () => unknown, code: string) {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error("Diharapkan AppError");
}

describe("createPlan", () => {
  it("membuat plan di langkah 2 dengan tech stack 'ai-pilih' dan workspace bawaan", () => {
    const plan = service.createPlan(userId, { idea: "Booking klinik", language: "id" });
    expect(plan).toMatchObject({
      userId,
      idea: "Booking klinik",
      language: "id",
      step: 2,
      status: "draft",
      title: null,
      techStack: {
        backend: "ai-pilih",
        database: "ai-pilih",
        frontend: "ai-pilih",
        deployment: "ai-pilih",
      },
      extras: [],
      questionAnswers: { questions: [], answers: {} },
      workspaceName: "Pribadi",
    });
    expect(new Date(plan.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("memakai satu workspace bawaan untuk semua plan pengguna", () => {
    const a = service.createPlan(userId, { idea: "A", language: "id" });
    const b = service.createPlan(userId, { idea: "B", language: "en" });
    expect(b.workspaceId).toBe(a.workspaceId);
    expect(handle.db.select().from(workspaces).all()).toHaveLength(1);
  });
});

describe("kepemilikan", () => {
  it("plan orang lain tidak terlihat, tidak bisa diubah, dan tidak bisa dihapus", async () => {
    const other = seedUser(handle.db, "lain@piard.local").id;
    const plan = service.createPlan(userId, { idea: "rahasia", language: "id" });

    await expectAppError(() => service.getPlan(other, plan.id), "NOT_FOUND");
    await expectAppError(
      () => service.updatePlan(other, plan.id, { step: 3 }),
      "NOT_FOUND",
    );
    await expectAppError(() => service.deletePlan(other, plan.id), "NOT_FOUND");
    await expectAppError(
      () => service.saveQuestions(other, plan.id, QUESTIONS),
      "NOT_FOUND",
    );
    expect(service.listPlans(other)).toEqual([]);
    expect(service.getPlan(userId, plan.id).plan.idea).toBe("rahasia");
  });

  it("id tidak dikenal menghasilkan NOT_FOUND", async () => {
    await expectAppError(() => service.getPlan(userId, "tidak-ada"), "NOT_FOUND");
  });
});

describe("findPlan", () => {
  it("mengembalikan plan milik sendiri, dan undefined untuk id asing atau milik orang lain", () => {
    const other = seedUser(handle.db, "lain@piard.local").id;
    const plan = service.createPlan(userId, { idea: "x", language: "id" });
    expect(service.findPlan(userId, plan.id)?.id).toBe(plan.id);
    expect(service.findPlan(userId, "tidak-ada")).toBeUndefined();
    expect(service.findPlan(other, plan.id)).toBeUndefined();
  });
});

describe("getPlan dan listPlans", () => {
  it("getPlan membawa daftar kosong untuk lampiran, chat, dan dokumen", () => {
    const created = service.createPlan(userId, { idea: "x", language: "id" });
    expect(service.getPlan(userId, created.id)).toMatchObject({
      plan: { id: created.id },
      attachments: [],
      chatMessages: [],
      documents: [],
    });
  });

  it("listPlans mengurutkan yang terakhir diubah paling atas", async () => {
    const first = service.createPlan(userId, { idea: "pertama", language: "id" });
    const second = service.createPlan(userId, { idea: "kedua", language: "id" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    service.updatePlan(userId, first.id, { step: 3 });
    expect(service.listPlans(userId).map((p) => p.id)).toEqual([first.id, second.id]);
  });
});

describe("updatePlan", () => {
  it("menggabungkan tech stack parsial dan mengganti extras", () => {
    const plan = service.createPlan(userId, { idea: "x", language: "id" });
    service.updatePlan(userId, plan.id, {
      techStack: { backend: "Laravel", database: "PostgreSQL" },
      extras: ["Auth", "Pembayaran"],
    });
    const { plan: saved } = service.getPlan(userId, plan.id);
    expect(saved.techStack).toEqual({
      backend: "Laravel",
      database: "PostgreSQL",
      frontend: "ai-pilih",
      deployment: "ai-pilih",
    });
    expect(saved.extras).toEqual(["Auth", "Pembayaran"]);
  });

  it("menyimpan step dan judul", () => {
    const plan = service.createPlan(userId, { idea: "x", language: "id" });
    service.updatePlan(userId, plan.id, { step: 3, title: "Judul" });
    expect(service.getPlan(userId, plan.id).plan).toMatchObject({
      step: 3,
      title: "Judul",
    });
  });

  it("memperbarui updatedAt", async () => {
    const plan = service.createPlan(userId, { idea: "x", language: "id" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    service.updatePlan(userId, plan.id, { step: 3 });
    expect(service.getPlan(userId, plan.id).plan.updatedAt > plan.updatedAt).toBe(true);
  });
});

describe("jawaban pertanyaan", () => {
  function planWithQuestions() {
    const plan = service.createPlan(userId, { idea: "x", language: "id" });
    service.saveQuestions(userId, plan.id, QUESTIONS);
    return plan;
  }

  it("menyimpan jawaban dan mempertahankan jawaban lama saat autosave per pertanyaan", () => {
    const plan = planWithQuestions();
    service.updatePlan(userId, plan.id, {
      questionAnswers: { answers: { pain: "Dewi" } },
    });
    service.updatePlan(userId, plan.id, {
      questionAnswers: { answers: { win: "a", must: ["x", "z"] } },
    });
    expect(service.getPlan(userId, plan.id).plan.questionAnswers).toEqual({
      questions: QUESTIONS,
      answers: { pain: "Dewi", win: "a", must: ["x", "z"] },
    });
  });

  it("mencatat pertanyaan yang dilewati sebagai jawaban kosong", () => {
    const plan = planWithQuestions();
    service.updatePlan(userId, plan.id, {
      questionAnswers: { answers: { pain: "", must: [] } },
    });
    expect(service.getPlan(userId, plan.id).plan.questionAnswers.answers).toEqual({
      pain: "",
      must: [],
    });
  });

  it("membuang id yang tidak ada di pertanyaan (mis. setelah dibuat ulang)", () => {
    const plan = planWithQuestions();
    service.updatePlan(userId, plan.id, {
      questionAnswers: { answers: { hantu: "x", pain: "ok" } },
    });
    expect(service.getPlan(userId, plan.id).plan.questionAnswers.answers).toEqual({
      pain: "ok",
    });
  });

  it("menolak bentuk jawaban yang tidak cocok dengan jenis pertanyaan", async () => {
    const plan = planWithQuestions();
    await expectAppError(
      () =>
        service.updatePlan(userId, plan.id, {
          questionAnswers: { answers: { must: "x" } },
        }),
      "VALIDATION",
    );
    await expectAppError(
      () =>
        service.updatePlan(userId, plan.id, {
          questionAnswers: { answers: { win: ["a"] } },
        }),
      "VALIDATION",
    );
    expect(service.getPlan(userId, plan.id).plan.questionAnswers.answers).toEqual({});
  });

  it("saveQuestions menghapus jawaban lama", () => {
    const plan = planWithQuestions();
    service.updatePlan(userId, plan.id, { questionAnswers: { answers: { pain: "x" } } });
    service.saveQuestions(userId, plan.id, QUESTIONS.slice(0, 2));
    expect(service.getPlan(userId, plan.id).plan.questionAnswers).toEqual({
      questions: QUESTIONS.slice(0, 2),
      answers: {},
    });
  });
});

describe("deletePlan", () => {
  it("menghapus plan dan hanya plan itu", () => {
    const a = service.createPlan(userId, { idea: "a", language: "id" });
    const b = service.createPlan(userId, { idea: "b", language: "id" });
    service.deletePlan(userId, a.id);
    expect(service.listPlans(userId).map((p) => p.id)).toEqual([b.id]);
  });
});
