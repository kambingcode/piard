import { z } from "zod";

/**
 * Target prompt (doc 07 bagian 8.4-8.5) dan batas skema. Skema lebih longgar daripada target agar
 * satu butir kelebihan tidak membuang hasil yang sudah dibayar; target diperiksa `pnpm eval:build`.
 */
export const TARGET_NEEDS = { min: 3, max: 6 } as const;
export const TARGET_TASKS = { min: 3, max: 8 } as const;

const line = z.string().trim().min(1).max(600);

const specOutput = z.object({
  goal: line,
  needs: z.array(line).min(1).max(12),
});

/** Spesifikasi satu fitur dan sub-fiturnya, berurutan sama dengan masukan. */
export const specOutputSchema = z.object({
  feature: specOutput,
  subFeatures: z.array(specOutput.extend({ name: line })).max(12),
});
export type SpecOutput = z.infer<typeof specOutputSchema>;
export type SpecParts = z.infer<typeof specOutput>;

/**
 * Satu task dari model. Prompt siap tempel tidak ditulis model, tetapi dirakit `renderTaskPrompt`
 * dari langkah dan kriteria ini ditambah konteks produk dan spesifikasi, sehingga selalu berdiri
 * sendiri apa pun modelnya (model gratis kadang menulis prompt 20 kata).
 */
export const taskOutputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2_000),
  steps: z.array(line).min(1).max(10),
  done: z.array(line).min(1).max(6),
});
export type TaskOutput = z.infer<typeof taskOutputSchema>;

export const tasksOutputSchema = z.object({
  tasks: z.array(taskOutputSchema).min(2).max(12),
});
export type TasksOutput = z.infer<typeof tasksOutputSchema>;
