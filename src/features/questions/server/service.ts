import "server-only";

import type { PlansService } from "@/features/plans/server";
import type { AiClient } from "@/server/ai";
import { mockQuestions } from "../ai/questions.mock";
import { buildQuestionsPrompt } from "../ai/questions.prompt";
import { questionsOutputSchema } from "../ai/questions.schema";

export type GenerateQuestionsOptions = {
  /** Membuat ulang walau pertanyaan sudah ada; jawaban lama dihapus. */
  regenerate?: boolean;
};

/** Pertanyaan klarifikasi: prompt → AI → simpan ke plan. Tidak tahu soal HTTP. */
export function createQuestionsService(deps: {
  plans: PlansService;
  ai: AiClient;
  /** Dokumentasi proyek eksisting untuk prompt plan fitur baru (M7-19); bawaan: tanpa konteks. */
  codebaseContext?: (userId: string, codebaseId: string | null) => string;
}) {
  const codebaseContext = deps.codebaseContext ?? (() => "");
  /**
   * Permintaan yang sedang berjalan, per pengguna + plan + mode. Permintaan yang sama menumpang
   * hasilnya (tidak membayar AI dua kali saat halaman dimuat ulang, dua tab, atau StrictMode).
   * Kuncinya memuat `userId` agar pengguna lain tidak bisa menumpang plan yang bukan miliknya.
   */
  const inflight = new Map<string, Promise<boolean>>();

  async function run(
    userId: string,
    planId: string,
    regenerate: boolean,
  ): Promise<boolean> {
    const { plan } = deps.plans.getPlan(userId, planId);
    if (plan.questionAnswers.questions.length > 0 && !regenerate) return false;

    const { system, prompt } = buildQuestionsPrompt({
      ...plan,
      codebaseContext: codebaseContext(userId, plan.codebaseId),
    });
    const { data } = await deps.ai.generateStructured({
      task: "questions",
      userId,
      planId: plan.id,
      system,
      prompt,
      schema: questionsOutputSchema,
      mock: () => mockQuestions(plan.language),
    });
    deps.plans.saveQuestions(userId, plan.id, data.questions);
    return true;
  }

  return {
    /**
     * Memastikan plan punya pertanyaan klarifikasi. Idempoten: bila sudah ada dan tidak diminta
     * membuat ulang, tidak ada panggilan AI.
     *
     * @returns true bila pertanyaan baru dibuat.
     * @throws {AppError} `NOT_FOUND` bila plan bukan milik pengguna; `UPSTREAM_AI` bila model gagal.
     */
    generateQuestions(
      userId: string,
      planId: string,
      { regenerate = false }: GenerateQuestionsOptions = {},
    ): Promise<boolean> {
      const key = `${userId}:${planId}:${regenerate ? "regenerate" : "ensure"}`;
      const running = inflight.get(key);
      if (running) return running;

      const started = run(userId, planId, regenerate).finally(() => inflight.delete(key));
      inflight.set(key, started);
      return started;
    },
  };
}

export type QuestionsService = ReturnType<typeof createQuestionsService>;
