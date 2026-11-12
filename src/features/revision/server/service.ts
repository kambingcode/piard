import "server-only";

import { z } from "zod";
import { planTitle } from "@/features/plans";
import type { PlansService } from "@/features/plans/server";
import type { PrdService } from "@/features/prd/server";
import { type FeatureChange, featureChangeSchema } from "@/features/roadmap";
import type { RoadmapService } from "@/features/roadmap/server";
import { type AiClient, defineChatTool, type ModelMessage } from "@/server/ai";
import { AppError } from "@/server/http/errors";
import type { JobHandler, JobRecord, JobRunner } from "@/server/jobs";
import {
  normalizeChanges,
  rawChangeSchema,
  rawChangesSchema,
} from "../ai/changes.schema";
import { mockChat } from "../ai/chat.mock";
import {
  buildChatSystem,
  buildReconcilePrompt,
  type ChatPromptInput,
  TOOL_PROPOSE_CHANGES,
  TOOL_UPDATE_PRD,
} from "../ai/chat.prompt";
import { mockReconcile } from "../ai/reconcile.mock";
import { revisionCopy } from "../copy";
import {
  type ChatMessage,
  type ChatPart,
  type ChatStreamEvent,
  HISTORY_LIMIT,
  PROPOSAL_SCOPES,
  type Proposal,
  type ProposalScope,
  type SyncStatus,
} from "../schemas";
import type { MessageRow, ProposalRow, RevisionRepo } from "./repo";

/** Job "Sesuaikan fitur dengan PRD". */
export const RECONCILE_JOB = "sync-features";

const copy = revisionCopy;
const userPayloadSchema = z.object({ userId: z.string().min(1) });

/** Potongan pesan yang disimpan di `plan_messages.parts` (status dibaca ulang saat dimuat). */
const storedPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("prd-revision"),
    jobId: z.string(),
    fromVersion: z.number().int(),
    summary: z.string(),
  }),
  z.object({ type: z.literal("proposal"), proposalId: z.string() }),
  z.object({ type: z.literal("notice"), text: z.string() }),
]);
type StoredPart = z.infer<typeof storedPartSchema>;

const updatePrdInput = z.object({
  instructions: z.string().min(1).describe("Perubahan PRD yang lengkap dan spesifik"),
  summary: z.string().describe("Ringkasan perubahan dalam 1 kalimat untuk pengguna"),
});
const proposeInput = z.object({ changes: z.array(rawChangeSchema).min(1) });

/** Plan yang sedang menunggu balasan chat. Di globalThis: route handler bisa dimuat dua kali. */
const globalForChat = globalThis as typeof globalThis & { __piardChatBusy?: Set<string> };
globalForChat.__piardChatBusy ??= new Set<string>();
const busyPlans = globalForChat.__piardChatBusy;

type Deps = {
  plans: PlansService;
  prd: Pick<PrdService, "getPrd" | "startRevision" | "listVersions">;
  roadmap: Pick<RoadmapService, "getRoadmap" | "applyChanges">;
  repo: RevisionRepo;
  ai: AiClient;
  jobs: Pick<JobRunner, "enqueue" | "latestFor" | "get">;
};

const isActive = (job: JobRecord | undefined) =>
  job !== undefined && (job.state === "queued" || job.state === "running");

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    planId: row.planId,
    scope: PROPOSAL_SCOPES.find((s) => s === row.scope) ?? "chat",
    status: row.status,
    changes: z.array(featureChangeSchema).catch([]).parse(row.ops),
    createdAt: row.createdAt.toISOString(),
  };
}

function storedParts(row: MessageRow): StoredPart[] {
  return row.parts.flatMap((part) => {
    const parsed = storedPartSchema.safeParse(part);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Ringkasan teks satu usulan untuk riwayat model (model tidak melihat kartu UI). */
function describeChanges(changes: FeatureChange[]): string {
  return changes
    .map((c) =>
      c.op === "add"
        ? `tambah "${c.name}"`
        : c.op === "remove"
          ? `hapus "${c.name}"`
          : `ubah "${c.before.name}"`,
    )
    .join(", ");
}

/** Chat revisi PRD (R13), usulan perubahan fitur, dan sinkronisasi PRD ↔ fitur (R14). */
export function createRevisionService({ plans, prd, roadmap, repo, ai, jobs }: Deps) {
  /** Fitur level atas sebagai target perubahan, dengan nama sub-fiturnya untuk konteks model. */
  function targets(userId: string, planId: string): ChatPromptInput["features"] {
    const state = roadmap.getRoadmap(userId, planId);
    return state.features.map((f) => ({
      id: f.id,
      name: f.name,
      summary: f.summary,
      phase: f.phase,
      subFeatures: state.subFeatures
        .filter((s) => s.parentId === f.id)
        .map((s) => s.name),
    }));
  }

  /** PRD terbaru. @throws CONFLICT bila belum ada. */
  function latestPrd(userId: string, planId: string) {
    const state = prd.getPrd(userId, planId);
    if (!state.document) throw new AppError("CONFLICT", copy.errors.noPrd);
    return state.document;
  }

  function hydratePart(
    planId: string,
    part: StoredPart,
    versions: () => number[],
  ): ChatPart | undefined {
    if (part.type === "text" || part.type === "notice") return part;
    if (part.type === "proposal") {
      const row = repo.findProposal(planId, part.proposalId);
      return row ? { type: "proposal", proposal: toProposal(row) } : undefined;
    }
    const job = jobs.get(part.jobId);
    const failed = !job || job.state === "failed" || job.state === "cancelled";
    const done = job?.state === "succeeded";
    // Selama job berjalan pengguna tidak bisa menyimpan PRD, jadi versi pertama sesudah
    // `fromVersion` adalah hasil revisi ini.
    const version = done ? (versions().find((v) => v > part.fromVersion) ?? null) : null;
    return {
      type: "prd-revision",
      summary: part.summary,
      status: done ? "done" : failed ? "failed" : "running",
      version,
      error: failed ? (job?.error ?? copy.revision.failed) : null,
    };
  }

  function toMessage(userId: string, row: MessageRow): ChatMessage {
    let cached: number[] | undefined;
    const versions = () => {
      cached ??= prd
        .listVersions(userId, row.planId)
        .map((v) => v.version)
        .sort((a, b) => a - b);
      return cached;
    };
    return {
      id: row.id,
      role: row.role === "user" ? "user" : "assistant",
      parts: storedParts(row).flatMap((part) => {
        const hydrated = hydratePart(row.planId, part, versions);
        return hydrated ? [hydrated] : [];
      }),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Riwayat untuk model: teks saja; tindakan di kartu diringkas agar model tahu hasilnya. */
  function history(userId: string, planId: string): ModelMessage[] {
    return repo.listMessages(planId, HISTORY_LIMIT).flatMap((row): ModelMessage[] => {
      const message = toMessage(userId, row);
      const text = message.parts
        .map((part) => {
          if (part.type === "text") return part.text;
          if (part.type === "notice") return `[${part.text}]`;
          if (part.type === "prd-revision")
            return `[updatePrd: ${part.summary} (${part.status})]`;
          return `[proposeFeatureChanges: ${describeChanges(part.proposal.changes)} (${part.proposal.status})]`;
        })
        .join("\n")
        .trim();
      if (!text) return [];
      return [
        message.role === "user"
          ? { role: "user", content: text }
          : { role: "assistant", content: text },
      ];
    });
  }

  function createProposal(
    userId: string,
    planId: string,
    scope: ProposalScope,
    changes: FeatureChange[],
  ): ProposalRow {
    plans.getPlan(userId, planId);
    return repo.atomic(() => {
      if (scope === "prd-to-features") repo.supersedePending(planId, scope);
      return repo.insertProposal(planId, scope, changes);
    });
  }

  function syncStatus(userId: string, planId: string): SyncStatus {
    const sync = plans.getSync(userId, planId);
    const job = jobs.latestFor(planId, RECONCILE_JOB);
    const existing = new Set(targets(userId, planId).map((f) => f.id));
    return {
      prd: sync.prd,
      staleFeatureIds: sync.staleFeatureIds.filter((id) => existing.has(id)),
      pending: repo.listPending(planId).map(toProposal),
      reconciling: isActive(job),
      error:
        sync.prd.dirty && (job?.state === "failed" || job?.state === "cancelled")
          ? (job.error ?? copy.errors.reconcileFailed)
          : null,
    };
  }

  /**
   * Aliran satu balasan. Pesan pengguna disimpan dulu; balasan disimpan di akhir bersama tindakan
   * yang dijalankan tool. Bila model gagal sebelum ada tindakan, pesan pengguna dihapus lagi agar
   * riwayat tidak berisi pertanyaan tanpa jawaban (klien mengembalikan teksnya ke kotak pesan).
   */
  async function* reply(
    userId: string,
    planId: string,
    text: string,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<ChatStreamEvent> {
    const plan = plans.getPlan(userId, planId).plan;
    const document = latestPrd(userId, planId);
    const features = targets(userId, planId);
    const previous = history(userId, planId);
    const userRow = repo.insertMessage(planId, "user", [{ type: "text", text }]);
    yield { type: "user", message: toMessage(userId, userRow) };

    const parts: StoredPart[] = [];
    let buffered = "";
    const flushText = () => {
      if (buffered.trim()) parts.push({ type: "text", text: buffered });
      buffered = "";
    };
    /** Bagian tindakan yang perlu dikirim ke klien sesudah tool berjalan. */
    const outbox: ChatPart[] = [];
    const versions = () => prd.listVersions(userId, planId).map((v) => v.version);
    const record = (part: StoredPart) => {
      flushText();
      parts.push(part);
      const hydrated = hydratePart(planId, part, versions);
      if (hydrated) outbox.push(hydrated);
    };
    const refuse = (reason: string) => {
      record({ type: "notice", text: reason });
      return { ok: false, error: reason };
    };

    const tools = {
      [TOOL_UPDATE_PRD]: defineChatTool({
        description:
          "Merevisi PRD sesuai permintaan pengguna. Memulai penulisan ulang PRD; hasilnya menjadi versi baru.",
        inputSchema: updatePrdInput,
        execute: async ({ instructions, summary }) => {
          try {
            const started = prd.startRevision(userId, planId, instructions);
            record({
              type: "prd-revision",
              jobId: started.jobId,
              fromVersion: started.fromVersion,
              summary: summary.trim() || instructions.slice(0, 120),
            });
            return { ok: true, status: "started" };
          } catch (error) {
            if (error instanceof AppError) return refuse(error.message);
            throw error;
          }
        },
      }),
      [TOOL_PROPOSE_CHANGES]: defineChatTool({
        description:
          "Mengusulkan perubahan daftar fitur roadmap (add/update/remove). Pengguna menerima atau menolak usulan.",
        inputSchema: proposeInput,
        execute: async ({ changes }) => {
          const normalized = normalizeChanges(changes, features);
          if (normalized.length === 0) return refuse(copy.errors.noChanges);
          const row = createProposal(userId, planId, "chat", normalized);
          record({ type: "proposal", proposalId: row.id });
          return { ok: true, proposalId: row.id };
        },
      }),
    };

    try {
      const stream = ai.streamChat({
        task: "chat",
        userId,
        planId,
        system: buildChatSystem({
          language: plan.language,
          title: planTitle(plan),
          prd: document.content,
          prdVersion: document.version,
          features,
        }),
        messages: [...previous, { role: "user", content: text }],
        tools,
        mock: () => mockChat(text),
        abortSignal: signal,
      });
      for await (const event of stream.events) {
        if (event.type === "text") {
          buffered += event.text;
          yield { type: "text", text: event.text };
        }
        while (outbox.length > 0) {
          const part = outbox.shift();
          if (part) yield { type: "part", part };
        }
      }
      await stream.completed;
    } catch (error) {
      if (parts.length === 0 && !buffered.trim()) {
        repo.deleteMessage(userRow.id);
        const message = error instanceof AppError ? error.message : copy.errors.failed;
        yield { type: "error", error: signal?.aborted ? copy.errors.failed : message };
        return;
      }
      // Sebagian balasan atau tindakan sudah terjadi: simpan apa adanya.
    }
    flushText();
    const assistant = repo.insertMessage(planId, "assistant", parts);
    yield { type: "done", message: toMessage(userId, assistant) };
  }

  /**
   * Job "Sesuaikan fitur dengan PRD": model membandingkan PRD dengan fitur dan hasilnya disimpan
   * sebagai satu usulan (`prd-to-features`). Tanpa perubahan, PRD dianggap sudah sesuai. Idempoten:
   * usulan lama dari lingkup yang sama digantikan.
   */
  const runReconcileJob: JobHandler = async ({ job, signal, progress, logger }) => {
    const { userId } = userPayloadSchema.parse(job.payload);
    if (!job.planId) throw new Error("Job penyesuaian tanpa planId");
    const planId = job.planId;
    progress({ phase: "comparing", done: 0, total: 1 });
    const { plan } = plans.getPlan(userId, planId);
    const document = latestPrd(userId, planId);
    const features = targets(userId, planId);
    const { system, prompt } = buildReconcilePrompt({
      language: plan.language,
      title: planTitle(plan),
      prd: document.content,
      features,
    });
    const { data } = await ai.generateStructured({
      task: "chat",
      userId,
      planId,
      refId: job.id,
      system,
      prompt,
      schema: rawChangesSchema,
      mock: () => ({ changes: mockReconcile(document.content, features) }),
      abortSignal: signal,
    });
    if (signal.aborted) return;
    const changes = normalizeChanges(data.changes, features);
    if (changes.length === 0) {
      plans.updateSync(userId, planId, (sync) => ({
        ...sync,
        prd: { ...sync.prd, dirty: false },
      }));
    } else {
      createProposal(userId, planId, "prd-to-features", changes);
    }
    progress({ phase: "done", done: 1 });
    logger.info("penyesuaian fitur selesai", { planId, changes: changes.length });
  };

  /** Menandai PRD selaras dengan fitur (usulan penyesuaian diputuskan, atau pengguna mengabaikan). */
  function markAligned(userId: string, planId: string) {
    plans.updateSync(userId, planId, (sync) => ({
      ...sync,
      prd: { ...sync.prd, dirty: false },
    }));
  }

  function ownedProposal(userId: string, id: string): ProposalRow {
    const row = repo.findOwnedProposal(userId, id);
    if (!row) throw new AppError("NOT_FOUND", copy.errors.proposalNotFound);
    if (row.status !== "pending")
      throw new AppError("CONFLICT", copy.errors.proposalResolved);
    return row;
  }

  return {
    runReconcileJob,

    listMessages(userId: string, planId: string): ChatMessage[] {
      const { plan } = plans.getPlan(userId, planId);
      return repo.listMessages(plan.id).map((row) => toMessage(userId, row));
    },

    /**
     * Mengirim pesan dan mengalirkan balasan. Pemeriksaan (kepemilikan, PRD ada, tidak ada balasan
     * lain yang berjalan) terjadi sebelum aliran dibuat, sehingga galatnya menjadi respons HTTP biasa.
     */
    sendMessage(
      userId: string,
      planId: string,
      text: string,
      signal?: AbortSignal,
    ): AsyncGenerator<ChatStreamEvent> {
      const { plan } = plans.getPlan(userId, planId);
      latestPrd(userId, plan.id);
      if (busyPlans.has(plan.id)) throw new AppError("CONFLICT", copy.errors.busy);
      busyPlans.add(plan.id);
      const inner = reply(userId, plan.id, text, signal);
      return (async function* () {
        try {
          yield* inner;
        } finally {
          busyPlans.delete(plan.id);
        }
      })();
    },

    getSyncStatus(userId: string, planId: string): SyncStatus {
      const { plan } = plans.getPlan(userId, planId);
      return syncStatus(userId, plan.id);
    },

    /** Memulai "Sesuaikan fitur dengan PRD"; idempoten selama job berjalan. */
    startReconcile(userId: string, planId: string): SyncStatus {
      const { plan } = plans.getPlan(userId, planId);
      latestPrd(userId, plan.id);
      if (!isActive(jobs.latestFor(plan.id, RECONCILE_JOB))) {
        jobs.enqueue({ kind: RECONCILE_JOB, planId: plan.id, payload: { userId } });
      }
      return syncStatus(userId, plan.id);
    },

    /**
     * Menerima usulan: perubahan diterapkan ke roadmap dalam transaksi yang sama dengan status usulan,
     * fitur yang berubah ditandai basi (spesifikasi & task perlu disesuaikan), dan usulan penyesuaian
     * menandai PRD selaras.
     */
    applyProposal(
      userId: string,
      proposalId: string,
    ): { proposal: Proposal; changed: number; sync: SyncStatus } {
      const row = ownedProposal(userId, proposalId);
      const proposal = toProposal(row);
      const applied = repo.atomic(() => {
        if (!repo.resolve(row.id, "accepted"))
          throw new AppError("CONFLICT", copy.errors.proposalResolved);
        return roadmap.applyChanges(userId, row.planId, proposal.changes);
      });
      const removed = new Set(applied.removedIds);
      plans.updateSync(userId, row.planId, (sync) => ({
        prd:
          proposal.scope === "prd-to-features" ? { ...sync.prd, dirty: false } : sync.prd,
        staleFeatureIds: [
          ...new Set([...sync.staleFeatureIds, ...applied.changedIds]),
        ].filter((id) => !removed.has(id)),
      }));
      return {
        proposal: { ...proposal, status: "accepted" },
        changed: applied.changedIds.length + applied.removedIds.length,
        sync: syncStatus(userId, row.planId),
      };
    },

    rejectProposal(
      userId: string,
      proposalId: string,
    ): { proposal: Proposal; sync: SyncStatus } {
      const row = ownedProposal(userId, proposalId);
      if (!repo.resolve(row.id, "rejected"))
        throw new AppError("CONFLICT", copy.errors.proposalResolved);
      if (row.scope === "prd-to-features") markAligned(userId, row.planId);
      return {
        proposal: { ...toProposal(row), status: "rejected" },
        sync: syncStatus(userId, row.planId),
      };
    },

    /** "Abaikan": PRD dianggap selaras tanpa mengubah fitur. */
    dismissPrdChange(userId: string, planId: string): SyncStatus {
      const { plan } = plans.getPlan(userId, planId);
      markAligned(userId, plan.id);
      return syncStatus(userId, plan.id);
    },
  };
}

export type RevisionService = ReturnType<typeof createRevisionService>;
