import { z } from "zod";
import { featureChangeSchema } from "@/features/roadmap";

const idSchema = z.string().min(1).max(64);

/** Batas satu pesan chat dari pengguna. */
export const MESSAGE_MAX_LENGTH = 4_000;

/** Pesan terakhir yang ikut dikirim ke model (lebih tua dari ini tidak diingat). */
export const HISTORY_LIMIT = 20;

export const sendMessageSchema = z.object({
  planId: idSchema,
  text: z
    .string()
    .trim()
    .min(1, "Pesan tidak boleh kosong.")
    .max(MESSAGE_MAX_LENGTH, `Pesan paling panjang ${MESSAGE_MAX_LENGTH} karakter.`),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const planBodySchema = z.object({ planId: idSchema });
export const planQuerySchema = planBodySchema;
export const proposalBodySchema = z.object({ proposalId: idSchema });

/**
 * Asal usulan: `chat` dari tool `proposeFeatureChanges`, `prd-to-features` dari tombol
 * "Sesuaikan fitur dengan PRD" (situs acuan memakai nama skema yang sama).
 */
export const PROPOSAL_SCOPES = ["chat", "prd-to-features"] as const;
export type ProposalScope = (typeof PROPOSAL_SCOPES)[number];

export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const proposalSchema = z.object({
  id: z.string(),
  planId: z.string(),
  scope: z.enum(PROPOSAL_SCOPES),
  status: z.enum(PROPOSAL_STATUSES),
  changes: z.array(featureChangeSchema),
  createdAt: z.string(),
});
export type Proposal = z.infer<typeof proposalSchema>;

/** Status revisi PRD yang dimulai dari chat, dibaca dari job-nya. */
export const REVISION_STATUSES = ["running", "done", "failed"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/** Potongan pesan pada respons API (potongan tersimpan dilengkapi status terbaru). */
export const chatPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("prd-revision"),
    summary: z.string(),
    status: z.enum(REVISION_STATUSES),
    /** Versi hasil revisi; null selama berjalan atau bila gagal. */
    version: z.number().int().nullable(),
    error: z.string().nullable(),
  }),
  z.object({ type: z.literal("proposal"), proposal: proposalSchema }),
  /** Tindakan yang ditolak server (mis. PRD sedang dibuat); ditulis untuk pengguna. */
  z.object({ type: z.literal("notice"), text: z.string() }),
]);
export type ChatPart = z.infer<typeof chatPartSchema>;

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(CHAT_ROLES),
  parts: z.array(chatPartSchema),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** Event aliran `POST /api/plan/chat` (NDJSON, satu per baris). */
export type ChatStreamEvent =
  | { type: "user"; message: ChatMessage }
  | { type: "text"; text: string }
  | { type: "part"; part: ChatPart }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; error: string };

/** Keadaan sinkronisasi PRD ↔ fitur ↔ task untuk panel revisi (`GET /api/plan/sync/status`). */
export const syncStatusSchema = z.object({
  prd: z.object({ dirty: z.boolean(), version: z.number().int().nullable() }),
  /** Fitur yang berubah sesudah spesifikasi dan task-nya dibuat. */
  staleFeatureIds: z.array(z.string()),
  /** Usulan yang menunggu keputusan, terbaru dulu. */
  pending: z.array(proposalSchema),
  /** Job "Sesuaikan fitur dengan PRD" sedang berjalan. */
  reconciling: z.boolean(),
  /** Pesan galat job penyesuaian terakhir, bila gagal dan PRD masih berubah. */
  error: z.string().nullable(),
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;
