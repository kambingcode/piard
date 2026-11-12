import { z } from "zod";
import { TASK_STATUSES } from "@/features/tasks";
import {
  DEFAULT_TOKEN_TTL_DAYS,
  FILE_PATH_MAX,
  FILES_CHANGED_MAX,
  NOTE_MAX,
  TOKEN_LABEL_MAX,
  TOKEN_TTL_DAYS,
  VERIFICATION_MAX,
} from "./limits";

const idSchema = z.string().min(1).max(64);

export const TASK_NOTE_AUTHORS = ["agent", "user"] as const;
export const TASK_NOTE_KINDS = ["note", "report", "question", "event"] as const;
export type TaskNoteAuthor = (typeof TASK_NOTE_AUTHORS)[number];
export type TaskNoteKind = (typeof TASK_NOTE_KINDS)[number];

/** Kode peristiwa di `task_notes.body` untuk `kind = event`; teksnya dari `copy.ts`. */
export const TASK_EVENTS = [
  "claim",
  "report",
  "release",
  "approve",
  "changes",
  "user_release",
] as const;
export type TaskEvent = (typeof TASK_EVENTS)[number];

// --- Token (pengguna, sesi) ---

export const createTokenSchema = z.object({
  planId: idSchema,
  label: z.string().trim().min(1, "Label token tidak boleh kosong.").max(TOKEN_LABEL_MAX),
  ttlDays: z.literal([...TOKEN_TTL_DAYS]).default(DEFAULT_TOKEN_TTL_DAYS),
});
export type CreateTokenInput = z.infer<typeof createTokenSchema>;

export const planQuerySchema = z.object({ planId: idSchema });
export const idParamsSchema = z.object({ id: idSchema });

export type AgentToken = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** Belum dicabut dan belum kedaluwarsa. */
  active: boolean;
};

export type CreatedToken = { token: string; agentToken: AgentToken };

// --- Catatan dan tinjauan (pengguna, sesi) ---

export const userNoteSchema = z.object({
  body: z.string().trim().min(1, "Catatan tidak boleh kosong.").max(NOTE_MAX),
});

export const reviewSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({
    decision: z.literal("changes"),
    note: z.string().trim().min(3, "Tulis apa yang perlu diperbaiki.").max(NOTE_MAX),
  }),
]);
export type ReviewInput = z.infer<typeof reviewSchema>;

export type TaskNote = {
  id: string;
  taskId: string;
  author: TaskNoteAuthor;
  kind: TaskNoteKind;
  body: string;
  /** Label token agen penulis (null untuk pengguna atau token yang sudah tidak ada). */
  tokenLabel: string | null;
  createdAt: string;
};

/** Keadaan agen per card untuk kanban (M8-07, M8-11). */
export type BoardCardMeta = {
  tokenLabel: string | null;
  claimedAt: string | null;
  /** Kabar terakhir dari agen (klaim atau catatan). */
  lastAgentAt: string | null;
  openQuestion: boolean;
  notes: number;
};
export type BoardMeta = { cards: Record<string, BoardCardMeta> };

// --- API agen (Bearer) ---

export const agentTaskListQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  featureId: idSchema.optional(),
});

export const reportSchema = z.strictObject({
  summary: z
    .string()
    .trim()
    .min(10, "Ringkasan laporan minimal 10 karakter: apa yang dikerjakan.")
    .max(NOTE_MAX),
  verification: z
    .string()
    .trim()
    .min(5, "Tulis cara memverifikasi (perintah tes dan hasilnya).")
    .max(VERIFICATION_MAX),
  filesChanged: z
    .array(z.string().trim().min(1).max(FILE_PATH_MAX))
    .max(FILES_CHANGED_MAX)
    .default([]),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const releaseSchema = z.strictObject({
  reason: z.string().trim().min(3, "Tulis alasan melepas task.").max(NOTE_MAX),
});

export const agentNoteSchema = z.strictObject({
  kind: z.enum(["note", "question"]).default("note"),
  body: z.string().trim().min(1, "Catatan tidak boleh kosong.").max(NOTE_MAX),
});
export type AgentNoteInput = z.infer<typeof agentNoteSchema>;
