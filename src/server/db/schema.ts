// Berkas ini dibaca langsung oleh drizzle-kit di luar bundler Next, jadi tidak boleh
// mengimpor `server-only` (daftar pengecualian ada di tests/unit/architecture.test.ts).

import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  AiSettingsOverrides,
  AnalysisSummary,
  CodebaseManifest,
  DetectedStack,
  JobPayload,
  JobProgress,
  MessagePart,
  QuestionAnswers,
  SyncOperation,
  SyncState,
  TechStack,
} from "./json-types";

export const LANGUAGES = ["id", "en"] as const;
export const PLAN_STATUSES = ["draft", "ready"] as const;
export const FEATURE_STATUSES = ["planned", "in-progress", "done"] as const;
export const FEATURE_SOURCES = ["ai", "user"] as const;
/** `review` (M8): dilaporkan agen, menunggu pengguna menyetujui. Kolom `text` tanpa CHECK (ADR 0017). */
export const TASK_STATUSES = ["todo", "doing", "review", "done"] as const;
export const TASK_NOTE_AUTHORS = ["agent", "user"] as const;
export const TASK_NOTE_KINDS = ["note", "report", "question", "event"] as const;
export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected"] as const;
export const CODEBASE_SOURCES = ["agent", "zip", "github"] as const;
export const CODEBASE_STATUSES = [
  "awaiting_source",
  "source_ready",
  "analyzing",
  "ready",
  "failed",
] as const;
export const CODEBASE_DOC_ORIGINS = ["agent", "ai", "manual"] as const;
export const JOB_STATES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

const newId = () => crypto.randomUUID();
const now = () => new Date();

const id = () => text("id").primaryKey().$defaultFn(newId);
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now)
    .$onUpdateFn(now);

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/** `id` menyimpan hash SHA-256 token sesi, bukan token mentahnya. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("workspaces_user_idx").on(t.userId)],
);

/**
 * Proyek eksisting (fitur codebase, ADR 0016). Kode sumbernya tidak disimpan di sini: hanya manifes,
 * teknologi yang terdeteksi, dan dokumentasi (`codebase_docs`). `sourceRef` tidak pernah berisi kredensial.
 */
export const codebases = sqliteTable(
  "codebases",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language", { enum: LANGUAGES }).notNull().default("id"),
    source: text("source", { enum: CODEBASE_SOURCES }).notNull(),
    sourceRef: text("source_ref"),
    status: text("status", { enum: CODEBASE_STATUSES })
      .notNull()
      .default("awaiting_source"),
    error: text("error"),
    detectedStack: text("detected_stack", { mode: "json" })
      .$type<DetectedStack>()
      .notNull()
      .default(sql`'{"languages":[],"tools":[]}'`),
    manifest: text("manifest", { mode: "json" }).$type<CodebaseManifest>(),
    sourceReceivedAt: integer("source_received_at", { mode: "timestamp_ms" }),
    analyzedAt: integer("analyzed_at", { mode: "timestamp_ms" }),
    /** Job `codebase-analyze` terakhir (job tidak terikat plan, jadi dilacak dari sini). */
    analysisJobId: text("analysis_job_id"),
    /** Ringkasan perubahan dokumentasi dari analisis/kiriman terakhir (M7-16). */
    analysisSummary: text("analysis_summary", { mode: "json" }).$type<AnalysisSummary>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("codebases_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const plans = sqliteTable(
  "plans",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    idea: text("idea").notNull(),
    language: text("language", { enum: LANGUAGES }).notNull().default("id"),
    title: text("title"),
    techStack: text("tech_stack", { mode: "json" })
      .$type<TechStack>()
      .notNull()
      .default(sql`'{}'`),
    extras: text("extras", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    questionAnswers: text("question_answers", { mode: "json" })
      .$type<QuestionAnswers>()
      .notNull()
      .default(sql`'{"questions":[],"answers":{}}'`),
    step: integer("step").notNull().default(1),
    status: text("status", { enum: PLAN_STATUSES }).notNull().default("draft"),
    syncState: text("sync_state", { mode: "json" })
      .$type<SyncState>()
      .notNull()
      .default(sql`'{}'`),
    prdSummary: text("prd_summary"),
    /** Proyek eksisting asal plan fitur baru (M7-18); `set null` agar plan tidak ikut terhapus. */
    codebaseId: text("codebase_id").references(() => codebases.id, {
      onDelete: "set null",
    }),
    /** Instruksi proyek untuk agen (M8-12): perintah tes, konvensi, folder terlarang. */
    agentInstructions: text("agent_instructions"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("plans_user_updated_idx").on(t.userId, t.updatedAt),
    index("plans_workspace_idx").on(t.workspaceId),
    index("plans_codebase_idx").on(t.codebaseId),
  ],
);

/** Fitur dan sub-fitur: sub-fitur adalah baris dengan `parentId` terisi. */
export const features = sqliteTable(
  "features",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnySQLiteColumn => features.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    icon: text("icon"),
    status: text("status", { enum: FEATURE_STATUSES }).notNull().default("planned"),
    priority: text("priority"),
    phase: integer("phase"),
    spec: text("spec").notNull().default(""),
    isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
    source: text("source", { enum: FEATURE_SOURCES }).notNull().default("ai"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("features_plan_parent_idx").on(t.planId, t.parentId, t.position),
    index("features_parent_idx").on(t.parentId),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    featureId: text("feature_id")
      .notNull()
      .references(() => features.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    prompt: text("prompt").notNull().default(""),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
    position: integer("position").notNull().default(0),
    /**
     * Klaim agen (M8, ADR 0017): token `plan_agent_tokens` yang memegang task dan waktunya. Tanpa kunci
     * asing agar migrasinya cukup `ADD COLUMN`; token hanya terhapus bersama plan (task ikut terhapus).
     */
    agentTokenId: text("agent_token_id"),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_plan_status_idx").on(t.planId, t.status),
    index("tasks_agent_token_idx").on(t.agentTokenId, t.status),
    index("tasks_feature_idx").on(t.featureId, t.position),
  ],
);

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("PRD"),
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("documents_plan_title_version_uq").on(t.planId, t.title, t.version),
  ],
);

/** Satu baris per versi halaman dokumentasi proyek eksisting, seperti `documents` untuk PRD. */
export const codebaseDocs = sqliteTable(
  "codebase_docs",
  {
    id: id(),
    codebaseId: text("codebase_id")
      .notNull()
      .references(() => codebases.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    origin: text("origin", { enum: CODEBASE_DOC_ORIGINS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("codebase_docs_codebase_slug_version_uq").on(
      t.codebaseId,
      t.slug,
      t.version,
    ),
  ],
);

/**
 * Usulan hasil analisis ulang untuk halaman yang pernah diedit manual (M7-16): tidak menggantikan versi
 * terbaru sampai pengguna menerimanya. Satu usulan per halaman; usulan baru menimpa yang lama.
 */
export const codebaseDocProposals = sqliteTable(
  "codebase_doc_proposals",
  {
    id: id(),
    codebaseId: text("codebase_id")
      .notNull()
      .references(() => codebases.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    content: text("content").notNull(),
    origin: text("origin", { enum: CODEBASE_DOC_ORIGINS }).notNull(),
    /** Versi terbaru halaman saat usulan dibuat (untuk tampilan berdampingan). */
    baseVersion: integer("base_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("codebase_doc_proposals_codebase_slug_uq").on(t.codebaseId, t.slug),
  ],
);

/** Token sekali pakai untuk agen lokal. Hanya hash SHA-256 yang disimpan (ADR 0016). */
export const agentTokens = sqliteTable(
  "agent_tokens",
  {
    id: id(),
    codebaseId: text("codebase_id")
      .notNull()
      .references(() => codebases.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    /** Jendela batas laju per token (M7-07): awal jendela dan jumlah permintaan di dalamnya. */
    windowStartedAt: integer("window_started_at", { mode: "timestamp_ms" }),
    windowCount: integer("window_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("agent_tokens_hash_uq").on(t.tokenHash),
    index("agent_tokens_codebase_idx").on(t.codebaseId),
  ],
);

/** Token agen per plan untuk jembatan MCP (ADR 0017). Hanya hash SHA-256 yang disimpan. */
export const planAgentTokens = sqliteTable(
  "plan_agent_tokens",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    windowStartedAt: integer("window_started_at", { mode: "timestamp_ms" }),
    windowCount: integer("window_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("plan_agent_tokens_hash_uq").on(t.tokenHash),
    index("plan_agent_tokens_plan_idx").on(t.planId),
  ],
);

/** Linimasa card (M8): laporan dan pertanyaan agen, catatan pengguna, dan peristiwa status. */
export const taskNotes = sqliteTable(
  "task_notes",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    author: text("author", { enum: TASK_NOTE_AUTHORS }).notNull(),
    kind: text("kind", { enum: TASK_NOTE_KINDS }).notNull(),
    body: text("body").notNull(),
    tokenId: text("token_id").references(() => planAgentTokens.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("task_notes_task_idx").on(t.taskId, t.createdAt),
    index("task_notes_plan_idx").on(t.planId),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
    path: text("path").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_plan_idx").on(t.planId)],
);

export const planMessages = sqliteTable(
  "plan_messages",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    role: text("role", { enum: MESSAGE_ROLES }).notNull(),
    parts: text("parts", { mode: "json" }).$type<MessagePart[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("plan_messages_plan_idx").on(t.planId, t.createdAt)],
);

export const syncProposals = sqliteTable(
  "sync_proposals",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    ops: text("ops", { mode: "json" }).$type<SyncOperation[]>().notNull(),
    status: text("status", { enum: PROPOSAL_STATUSES }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("sync_proposals_plan_status_idx").on(t.planId, t.status)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    kind: text("kind").notNull(),
    planId: text("plan_id").references(() => plans.id, { onDelete: "cascade" }),
    state: text("state", { enum: JOB_STATES }).notNull().default("queued"),
    payload: text("payload", { mode: "json" })
      .$type<JobPayload>()
      .notNull()
      .default(sql`'{}'`),
    progress: text("progress", { mode: "json" })
      .$type<JobProgress>()
      .notNull()
      .default(sql`'{"phase":"","done":0,"total":0}'`),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_state_created_idx").on(t.state, t.createdAt),
    index("jobs_plan_kind_idx").on(t.planId, t.kind),
  ],
);

/** Catatan pemakaian LLM. `planId` jadi null bila plan dihapus agar riwayat biaya tetap utuh. */
export const usage = sqliteTable(
  "usage",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => plans.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    refId: text("ref_id"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("usage_user_created_idx").on(t.userId, t.createdAt),
    index("usage_plan_idx").on(t.planId),
  ],
);

/** Pengaturan aplikasi (satu baris per kunci, mis. `ai`). Global karena aplikasi hanya punya satu pemilik. */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<AiSettingsOverrides>().notNull(),
  updatedAt: updatedAt(),
});
