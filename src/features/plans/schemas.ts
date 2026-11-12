import { z } from "zod";
import { plansCopy } from "./copy";

/** Bidang teknologi pada langkah "Preferensi teknologi". */
export const TECH_AREAS = ["backend", "database", "frontend", "deployment"] as const;
export type TechArea = (typeof TECH_AREAS)[number];

/** Nilai bidang teknologi yang berarti "biarkan AI memilih" (sama dengan situs acuan). */
export const AI_CHOICE = "ai-pilih";

export const LANGUAGES = ["id", "en"] as const;
export type PlanLanguage = (typeof LANGUAGES)[number];

/** Langkah wizard: 1 ide, 2 preferensi teknologi, 3 pertanyaan, 4 roadmap. */
export const MIN_STEP = 1;
export const MAX_STEP = 4;

export const IDEA_MAX_LENGTH = 6_000;
const TECH_VALUE_MAX_LENGTH = 120;
const EXTRA_MAX_LENGTH = 80;
const EXTRAS_MAX_COUNT = 30;
const TITLE_MAX_LENGTH = 120;
/** Instruksi proyek untuk agen (M8-12, ADR 0017). */
export const AGENT_INSTRUCTIONS_MAX_LENGTH = 8_000;
const ANSWER_MAX_LENGTH = 4_000;

export const questionTypeSchema = z.enum(["text", "single_choice", "multi_choice"]);

export const clarifyingQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  question: z.string().min(1),
  type: questionTypeSchema,
  options: z.array(z.string().min(1)),
  required: z.boolean(),
});

/** Jawaban: teks atau satu pilihan (string), atau banyak pilihan (string[]). Kosong berarti dilewati. */
export const answerValueSchema = z.union([
  z.string().max(ANSWER_MAX_LENGTH),
  z.array(z.string().max(ANSWER_MAX_LENGTH)).max(20),
]);

export const questionAnswersSchema = z.object({
  questions: z.array(clarifyingQuestionSchema),
  answers: z.record(z.string(), answerValueSchema),
});

const techValueSchema = z.string().trim().min(1).max(TECH_VALUE_MAX_LENGTH);

export const techStackSchema = z.object({
  backend: techValueSchema.optional(),
  database: techValueSchema.optional(),
  frontend: techValueSchema.optional(),
  deployment: techValueSchema.optional(),
});
export type TechStackInput = z.infer<typeof techStackSchema>;

const extrasSchema = z
  .array(z.string().trim().min(1).max(EXTRA_MAX_LENGTH))
  .max(EXTRAS_MAX_COUNT);

export const createPlanSchema = z.object({
  idea: z
    .string()
    .trim()
    .min(1, plansCopy.errors.ideaRequired)
    .max(IDEA_MAX_LENGTH, plansCopy.errors.ideaTooLong(IDEA_MAX_LENGTH)),
  language: z.enum(LANGUAGES).default("id"),
  /** Plan fitur baru untuk proyek eksisting (M7-18): teknologi diisi dari proyek itu. */
  codebaseId: z.string().min(1).max(64).optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

/**
 * Perubahan parsial plan. Field yang tidak dikenal (mis. `experience`, `budget` milik situs acuan)
 * diabaikan. Dari `questionAnswers` hanya `answers` yang dipakai: pertanyaan dibuat server.
 */
export const patchPlanSchema = z
  .object({
    techStack: techStackSchema.optional(),
    extras: extrasSchema.optional(),
    questionAnswers: z
      .object({ answers: z.record(z.string(), answerValueSchema) })
      .optional(),
    step: z.number().int().min(MIN_STEP).max(MAX_STEP).optional(),
    title: z.string().trim().min(1).max(TITLE_MAX_LENGTH).optional(),
    /** Teks kosong menghapus instruksi (disimpan null). */
    agentInstructions: z
      .string()
      .trim()
      .max(
        AGENT_INSTRUCTIONS_MAX_LENGTH,
        plansCopy.errors.instructionsTooLong(AGENT_INSTRUCTIONS_MAX_LENGTH),
      )
      .nullable()
      .optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    plansCopy.errors.emptyPatch,
  );
export type PatchPlanInput = z.infer<typeof patchPlanSchema>;

export const planIdParamsSchema = z.object({ id: z.string().min(1).max(64) });

/** Badan `POST /api/plan/jobs/cancel`. */
export const cancelPlanJobsSchema = z.object({ planId: z.string().min(1).max(64) });

export const generateQuestionsSchema = z.object({
  planId: z.string().min(1).max(64),
  /** Membuat ulang pertanyaan walau sudah ada (jawaban lama dihapus). */
  regenerate: z.boolean().default(false),
});

/** Bentuk plan pada respons API (tanggal ISO). Dipakai tes kontrak terhadap analysis/api-samples. */
export const planSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  idea: z.string(),
  language: z.enum(LANGUAGES),
  title: z.string().nullable(),
  techStack: techStackSchema,
  extras: z.array(z.string()),
  questionAnswers: questionAnswersSchema,
  step: z.number().int(),
  status: z.enum(["draft", "ready"]),
  syncState: z.record(z.string(), z.unknown()),
  prdSummary: z.string().nullable(),
  /** Proyek eksisting asal plan fitur baru (M7-18); null untuk plan biasa atau bila proyek dihapus. */
  codebaseId: z.string().nullable(),
  /** Instruksi proyek untuk agen coding (M8-12); null bila belum diisi. */
  agentInstructions: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Plan = z.infer<typeof planSchema>;
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;
export type AnswerValue = z.infer<typeof answerValueSchema>;
export type QuestionAnswers = z.infer<typeof questionAnswersSchema>;

/** Respons `GET /api/plan/:id`. Tiga daftar terakhir diisi fitur terkait (PRD, chat) di milestone berikutnya. */
export type PlanDetail = {
  plan: Plan;
  attachments: unknown[];
  chatMessages: unknown[];
  documents: unknown[];
};
