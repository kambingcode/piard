import { z } from "zod";
import { AI_TASKS, type AiTask } from "@/lib/ai-models";

export { AI_TASKS, type AiTask };

/** ID model OpenRouter (`vendor/model[:varian]`) atau Anthropic (`claude-…`). */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9][\w.\-:/]*$/;
export const MODEL_ID_MAX_LENGTH = 200;
export const BUDGET_MAX_USD = 100_000;

const modelIdSchema = z
  .string()
  .trim()
  .min(1, "Isi ID model.")
  .max(MODEL_ID_MAX_LENGTH, `Maksimal ${MODEL_ID_MAX_LENGTH} karakter.`)
  .regex(MODEL_ID_PATTERN, "Hanya huruf, angka, dan . - _ : /");

const usdLimitSchema = z
  .number()
  .positive("Batas harus lebih dari 0. Kosongkan untuk tanpa batas.")
  .max(BUDGET_MAX_USD, `Maksimal US$${BUDGET_MAX_USD}.`)
  .nullable();

/** Isi formulir /settings: semua model dan kedua batas dikirim sekaligus. */
export const updateSettingsSchema = z.object({
  models: z.object({
    questions: modelIdSchema,
    roadmap: modelIdSchema,
    prd: modelIdSchema,
    spec: modelIdSchema,
    tasks: modelIdSchema,
    chat: modelIdSchema,
    codebase: modelIdSchema,
  } satisfies Record<AiTask, typeof modelIdSchema>),
  budget: z.object({ dailyUsd: usdLimitSchema, monthlyUsd: usdLimitSchema }),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Nilai yang berlaku beserta nilai `.env`-nya, agar UI bisa menunjukkan mana yang diubah. */
export type SettingValue<T> = { value: T; envValue: T; overridden: boolean };

export type SettingsView = {
  /** `mock` = fixture tanpa jaringan; model hanya label. */
  mode: "mock" | "openrouter";
  models: Record<AiTask, SettingValue<string>>;
  budget: {
    dailyUsd: SettingValue<number | null>;
    monthlyUsd: SettingValue<number | null>;
  };
  /** Hanya apakah kunci terisi; nilainya tidak pernah dikirim ke klien. */
  keys: { openrouter: boolean; anthropic: boolean };
};

/** Saran di kolom model (yang sudah diuji, docs/ai-pipeline.md); ID lain tetap boleh diketik. */
export const MODEL_SUGGESTIONS = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "anthropic/claude-haiku-5.5",
  "nvidia/nemotron-3.5-super-vl:free",
] as const;
