import { z } from "zod";
import { clarifyingQuestionSchema } from "@/features/plans";

export const QUESTION_COUNT = 5;
export const MIN_OPTIONS = 3;
export const MAX_OPTIONS = 6;
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Keluaran model untuk pertanyaan klarifikasi: tepat 5 pertanyaan (doc 07 bagian 8.1).
 * Pertanyaan teks tanpa opsi; pertanyaan pilihan punya 3-6 opsi. Opsi "Lainnya" ditambah UI.
 */
export const questionsOutputSchema = z
  .object({
    questions: z
      .array(clarifyingQuestionSchema)
      .length(QUESTION_COUNT, `Harus tepat ${QUESTION_COUNT} pertanyaan`),
  })
  .superRefine(({ questions }, ctx) => {
    const seen = new Set<string>();
    questions.forEach((question, index) => {
      const at = (message: string) =>
        ctx.addIssue({ code: "custom", message, path: ["questions", index] });

      if (!ID_PATTERN.test(question.id)) at(`id "${question.id}" harus snake_case`);
      if (seen.has(question.id)) at(`id "${question.id}" dipakai dua kali`);
      seen.add(question.id);

      if (question.type === "text" && question.options.length > 0) {
        at("pertanyaan teks tidak boleh punya opsi");
      }
      if (
        question.type !== "text" &&
        (question.options.length < MIN_OPTIONS || question.options.length > MAX_OPTIONS)
      ) {
        at(`pertanyaan pilihan butuh ${MIN_OPTIONS}-${MAX_OPTIONS} opsi`);
      }
      if (new Set(question.options).size !== question.options.length) at("opsi ganda");
    });
  });

export type QuestionsOutput = z.infer<typeof questionsOutputSchema>;
