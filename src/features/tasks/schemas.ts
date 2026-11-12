import { z } from "zod";

const idSchema = z.string().min(1).max(64);

/** `review` (M8, ADR 0017): dilaporkan agen dan menunggu pengguna; hanya pengguna yang menulis `done`. */
export const TASK_STATUSES = ["todo", "doing", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
/** Status yang dipertahankan saat job menyusun ulang task: pekerjaan agen tidak ditimpa diam-diam. */
export const KEPT_ON_REGENERATE: readonly TaskStatus[] = ["doing", "review"];

export const TITLE_MAX_LENGTH = 160;
export const DESCRIPTION_MAX_LENGTH = 4_000;
export const PROMPT_MAX_LENGTH = 20_000;
/** Batas satu permintaan status massal; papan satu plan jauh di bawah ini. */
export const BULK_MAX = 500;

const titleSchema = z
  .string()
  .trim()
  .min(1, "Judul task tidak boleh kosong.")
  .max(TITLE_MAX_LENGTH);
const descriptionSchema = z.string().trim().max(DESCRIPTION_MAX_LENGTH);
const promptSchema = z.string().trim().max(PROMPT_MAX_LENGTH);

/** Task pada respons API (kolom tabel `tasks`, tanggal sebagai ISO). */
export const taskSchema = z.object({
  id: z.string(),
  planId: z.string(),
  featureId: z.string(),
  title: z.string(),
  description: z.string(),
  prompt: z.string(),
  status: z.enum(TASK_STATUSES),
  position: z.number().int(),
  /** Token agen yang mengklaim task (M8); null bila tidak diklaim agen. */
  agentTokenId: z.string().nullable(),
  claimedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskListQuerySchema = z.object({
  planId: idSchema,
  featureId: idSchema.optional(),
});

export const taskIdParamsSchema = z.object({ id: idSchema });

export const createTaskSchema = z.object({
  featureId: idSchema,
  title: titleSchema,
  description: descriptionSchema.default(""),
  prompt: promptSchema.default(""),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const patchTaskSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    prompt: promptSchema.optional(),
    status: z.enum(TASK_STATUSES).optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "Tidak ada perubahan.",
  });
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;

export const bulkStatusSchema = z.object({
  planId: idSchema,
  ids: z.array(idSchema).min(1).max(BULK_MAX),
  status: z.enum(TASK_STATUSES),
});
export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;

export const resetTasksSchema = z.object({ planId: idSchema });

/** Task baru dari AI untuk satu fitur (dipakai job spesifikasi & task). */
export type TaskDraft = { title: string; description: string; prompt: string };
