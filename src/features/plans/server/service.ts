import "server-only";

import { AppError } from "@/server/http/errors";
import { plansCopy } from "../copy";
import {
  AI_CHOICE,
  type AnswerValue,
  type ClarifyingQuestion,
  type CreatePlanInput,
  type PatchPlanInput,
  type Plan,
  type PlanDetail,
  TECH_AREAS,
  type TechArea,
} from "../schemas";
import { type PlanSync, readSync } from "../sync";
import type { PlanRow, PlansRepo, PlanUpdate } from "./repo";

/** Setelah plan dibuat, wizard langsung ke langkah 2 (preferensi teknologi). */
const STEP_AFTER_CREATE = 2;

const defaultTechStack = (): Plan["techStack"] => ({
  backend: AI_CHOICE,
  database: AI_CHOICE,
  frontend: AI_CHOICE,
  deployment: AI_CHOICE,
});

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    idea: row.idea,
    language: row.language,
    title: row.title,
    techStack: row.techStack,
    extras: row.extras,
    questionAnswers: row.questionAnswers,
    step: row.step,
    status: row.status,
    syncState: row.syncState,
    prdSummary: row.prdSummary,
    codebaseId: row.codebaseId,
    agentInstructions: row.agentInstructions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Bentuk jawaban harus cocok dengan jenis pertanyaannya: banyak pilihan = larik, lainnya = teks. */
function matchesQuestionType(question: ClarifyingQuestion, value: AnswerValue): boolean {
  return question.type === "multi_choice"
    ? Array.isArray(value)
    : typeof value === "string";
}

/**
 * Menyaring jawaban dari klien: id yang tidak ada di pertanyaan (mis. setelah pertanyaan dibuat
 * ulang) dibuang diam-diam, jawaban berbentuk salah ditolak. Jawaban lama untuk pertanyaan lain
 * dipertahankan sehingga autosave per pertanyaan tidak menimpa yang lain.
 */
function mergeAnswers(
  current: Plan["questionAnswers"],
  incoming: Record<string, AnswerValue>,
): Plan["questionAnswers"]["answers"] {
  const merged = { ...current.answers };
  for (const [id, value] of Object.entries(incoming)) {
    const question = current.questions.find((q) => q.id === id);
    if (!question) continue;
    if (!matchesQuestionType(question, value)) {
      throw new AppError(
        "VALIDATION",
        `Jawaban untuk "${id}" harus berupa ${question.type === "multi_choice" ? "daftar pilihan" : "teks"}.`,
      );
    }
    merged[id] = value;
  }
  return merged;
}

const notFound = () => new AppError("NOT_FOUND", plansCopy.errors.notFound);

/** Yang dibutuhkan plans dari proyek eksisting (fitur codebase, lewat `server.ts`-nya). */
export type CodebaseLookup = {
  find(
    userId: string,
    id: string,
  ): { detectedStack: Partial<Record<TechArea, string>> } | undefined;
};

/**
 * Teknologi plan fitur baru dari proyek eksisting: bidang yang terdeteksi diisi, sisanya tetap
 * "AI pilih" (M7-18).
 */
function techFromCodebase(stack: Partial<Record<TechArea, string>>): Plan["techStack"] {
  return Object.fromEntries(
    TECH_AREAS.map((area) => [area, stack[area]?.trim() || AI_CHOICE]),
  ) as Plan["techStack"]; // TECH_AREAS lengkap: kunci sama dengan techStackSchema.
}

/** Aturan bisnis plan. Tidak tahu soal HTTP; tiap fungsi diawali pemeriksaan kepemilikan. */
export function createPlansService(
  repo: PlansRepo,
  deps: { codebases?: CodebaseLookup } = {},
) {
  function requireRow(userId: string, id: string): PlanRow {
    const row = repo.find(userId, id);
    if (!row) throw notFound();
    return row;
  }

  return {
    /**
     * Plan baru dari ide. Dengan `codebaseId` (plan fitur baru untuk proyek eksisting), proyek harus milik
     * pengguna dan teknologinya diisi dari teknologi yang terdeteksi.
     *
     * @throws {AppError} `NOT_FOUND` bila proyek tidak ada atau milik orang lain.
     */
    createPlan(userId: string, input: CreatePlanInput): Plan {
      let techStack = defaultTechStack();
      if (input.codebaseId) {
        const codebase = deps.codebases?.find(userId, input.codebaseId);
        if (!codebase) throw new AppError("NOT_FOUND", plansCopy.errors.codebaseNotFound);
        techStack = techFromCodebase(codebase.detectedStack);
      }
      const workspace = repo.ensureDefaultWorkspace(userId);
      const row = repo.insert({
        userId,
        workspaceId: workspace.id,
        idea: input.idea,
        language: input.language,
        techStack,
        codebaseId: input.codebaseId ?? null,
        step: STEP_AFTER_CREATE,
      });
      return toPlan(row);
    },

    getPlan(userId: string, id: string): PlanDetail {
      return {
        plan: toPlan(requireRow(userId, id)),
        attachments: [],
        chatMessages: [],
        documents: [],
      };
    },

    /** Seperti `getPlan` tetapi mengembalikan undefined (untuk halaman yang memakai `notFound()`). */
    findPlan(userId: string, id: string): Plan | undefined {
      const row = repo.find(userId, id);
      return row ? toPlan(row) : undefined;
    },

    /** Pemilik plan tanpa pemeriksaan sesi: hanya untuk token agen yang sudah terverifikasi (ADR 0017). */
    ownerOf(planId: string): string | undefined {
      return repo.ownerOf(planId);
    },

    listPlans(userId: string): Plan[] {
      return repo.list(userId).map(toPlan);
    },

    updatePlan(userId: string, id: string, patch: PatchPlanInput): void {
      const row = requireRow(userId, id);
      const update: PlanUpdate = {};
      if (patch.techStack) update.techStack = { ...row.techStack, ...patch.techStack };
      if (patch.extras) update.extras = patch.extras;
      if (patch.step !== undefined) update.step = patch.step;
      if (patch.title !== undefined) update.title = patch.title;
      if (patch.agentInstructions !== undefined)
        update.agentInstructions = patch.agentInstructions || null;
      if (patch.questionAnswers) {
        update.questionAnswers = {
          questions: row.questionAnswers.questions,
          answers: mergeAnswers(row.questionAnswers, patch.questionAnswers.answers),
        };
      }
      if (!repo.update(userId, id, update)) throw notFound();
    },

    /** Menyimpan pertanyaan klarifikasi baru; jawaban lama dihapus karena tidak lagi relevan. */
    saveQuestions(userId: string, id: string, questions: ClarifyingQuestion[]): void {
      requireRow(userId, id);
      if (!repo.update(userId, id, { questionAnswers: { questions, answers: {} } })) {
        throw notFound();
      }
    },

    /**
     * Mencatat hasil roadmap: judul dari AI dipakai hanya bila plan belum punya judul, dan
     * `syncState` mendapat jumlah fase serta waktu kerangka dibuat (seperti situs acuan).
     */
    recordRoadmap(
      userId: string,
      id: string,
      { title, totalPhases }: { title: string; totalPhases: number },
    ): void {
      const row = requireRow(userId, id);
      const update: PlanUpdate = {
        syncState: {
          ...row.syncState,
          totalPhases,
          skeletonGeneratedAt: new Date().toISOString(),
        },
      };
      if (!row.title) update.title = title;
      if (!repo.update(userId, id, update)) throw notFound();
    },

    getSync(userId: string, id: string): PlanSync {
      return readSync(requireRow(userId, id).syncState);
    },

    /**
     * Mengubah status sinkronisasi (baca-ubah-tulis; aman karena better-sqlite3 sinkron). Data lain
     * di `syncState` (mis. jumlah fase roadmap) dipertahankan.
     */
    updateSync(
      userId: string,
      id: string,
      change: (sync: PlanSync) => PlanSync,
    ): PlanSync {
      const row = requireRow(userId, id);
      const next = change(readSync(row.syncState));
      if (!repo.update(userId, id, { syncState: { ...row.syncState, ...next } })) {
        throw notFound();
      }
      return next;
    },

    deletePlan(userId: string, id: string): void {
      if (!repo.delete(userId, id)) throw notFound();
    },
  };
}

export type PlansService = ReturnType<typeof createPlansService>;
