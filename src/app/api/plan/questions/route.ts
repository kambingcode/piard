import { authedRoute } from "@/features/auth/server";
import { generateQuestionsSchema } from "@/features/plans";
import { getQuestionsService } from "@/features/questions/server";

/** Membuat 5 pertanyaan klarifikasi dengan AI (idempoten kecuali `regenerate`). */
export const POST = authedRoute(
  { body: generateQuestionsSchema },
  async ({ user, body }) => {
    await getQuestionsService().generateQuestions(user.id, body.planId, {
      regenerate: body.regenerate,
    });
    return { ok: true };
  },
);
