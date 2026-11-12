import "server-only";

import type { PlansService } from "@/features/plans/server";
import { AppError } from "@/server/http/errors";
import { tasksCopy } from "../copy";
import type {
  BulkStatusInput,
  CreateTaskInput,
  PatchTaskInput,
  Task,
  TaskDraft,
  TaskStatus,
} from "../schemas";
import type { AgentMoveResult, TaskRow, TasksRepo } from "./repo";

type Deps = { plans: PlansService; repo: TasksRepo };

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    planId: row.planId,
    featureId: row.featureId,
    title: row.title,
    description: row.description,
    prompt: row.prompt,
    status: row.status,
    position: row.position,
    agentTokenId: row.agentTokenId,
    claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const notFound = () => new AppError("NOT_FOUND", tasksCopy.errors.notFound);

/** Hasil klaim/transisi agen dalam bentuk API (lihat `AgentMoveResult` di repo). */
export type AgentMove =
  | { kind: "ok"; task: Task; already: boolean }
  | { kind: "not_found" }
  | { kind: "conflict"; task: Task }
  | { kind: "busy"; held: Task };

function toMove(result: AgentMoveResult): AgentMove {
  switch (result.kind) {
    case "ok":
      return { kind: "ok", task: toTask(result.row), already: result.already };
    case "conflict":
      return { kind: "conflict", task: toTask(result.row) };
    case "busy":
      return { kind: "busy", held: toTask(result.held) };
    case "not_found":
      return result;
  }
}

/** Task per fitur: daftar, CRUD, status massal, dan penggantian hasil AI. */
export function createTasksService({ plans, repo }: Deps) {
  function owned(userId: string, id: string): TaskRow {
    const row = repo.findOwned(userId, id);
    if (!row) throw notFound();
    return row;
  }

  return {
    listTasks(userId: string, planId: string, featureId?: string): Task[] {
      const { plan } = plans.getPlan(userId, planId);
      return repo.listByPlan(plan.id, featureId).map(toTask);
    },

    /** Jumlah task per fitur (untuk menandai fitur yang sudah lengkap). */
    countByFeature(planId: string): Map<string, number> {
      return repo.countByFeature(planId);
    },

    createTask(userId: string, input: CreateTaskInput): Task {
      const feature = repo.findOwnedFeature(userId, input.featureId);
      if (!feature) throw new AppError("NOT_FOUND", tasksCopy.errors.featureNotFound);
      if (feature.parentId !== null)
        throw new AppError("VALIDATION", tasksCopy.errors.subFeature);
      return toTask(
        repo.insert({
          planId: feature.planId,
          featureId: feature.id,
          title: input.title,
          description: input.description,
          prompt: input.prompt,
        }),
      );
    },

    updateTask(userId: string, id: string, patch: PatchTaskInput): Task {
      const row = owned(userId, id);
      const updated = repo.update(row.id, patch);
      if (!updated) throw notFound();
      return toTask(updated);
    },

    deleteTask(userId: string, id: string): void {
      const row = owned(userId, id);
      if (!repo.delete(row.id)) throw notFound();
    },

    bulkStatus(userId: string, input: BulkStatusInput): { updated: number } {
      const { plan } = plans.getPlan(userId, input.planId);
      return { updated: repo.setStatus(plan.id, [...new Set(input.ids)], input.status) };
    },

    /** Semua task kembali ke "todo" (isi task tidak diubah). */
    resetTasks(userId: string, planId: string): { updated: number } {
      const { plan } = plans.getPlan(userId, planId);
      return { updated: repo.resetStatus(plan.id) };
    },

    /** Dipakai job: mengganti task satu fitur. @returns false bila fitur sudah dihapus. */
    replaceForFeature(planId: string, featureId: string, drafts: TaskDraft[]): boolean {
      return repo.replaceForFeature(planId, featureId, drafts);
    },

    /** Dipakai "buat ulang" job: menghapus task plan (kecuali `doing`/`review`, ADR 0017). */
    clearPlan(planId: string): void {
      repo.deleteByPlan(planId);
    },

    /** Task milik `userId`; `NOT_FOUND` bila tidak ada atau milik orang lain. */
    getOwned(userId: string, id: string): Task {
      return toTask(owned(userId, id));
    },

    /**
     * Transisi pengguna bersyarat (Setujui, Minta perbaikan, Lepas card agen). Klaim agen dilepas.
     * @throws {AppError} `CONFLICT` bila status sudah bukan salah satu `from` (mis. tab lain lebih dulu).
     */
    moveOwnedIf(
      userId: string,
      id: string,
      from: readonly TaskStatus[],
      to: TaskStatus,
    ): Task {
      const row = owned(userId, id);
      const moved = repo.moveIf(row.id, from, to);
      if (!moved) throw new AppError("CONFLICT", tasksCopy.errors.statusChanged);
      return toTask(moved);
    },

    // Untuk jembatan agen (ADR 0017). `planId` sudah diverifikasi lewat token oleh pemanggil, jadi
    // metode di bawah tidak menerima `userId`; semuanya tetap memfilter `plan_id`.

    listInPlan(planId: string, featureId?: string): Task[] {
      return repo.listByPlan(planId, featureId).map(toTask);
    },

    findInPlan(planId: string, id: string): Task | undefined {
      const row = repo.findInPlan(planId, id);
      return row ? toTask(row) : undefined;
    },

    heldByAgent(planId: string, tokenId: string): Task | undefined {
      const row = repo.heldByAgent(planId, tokenId);
      return row ? toTask(row) : undefined;
    },

    nextTodo(planId: string): Task | undefined {
      const row = repo.nextTodo(planId);
      return row ? toTask(row) : undefined;
    },

    claimForAgent(planId: string, id: string, tokenId: string, at: Date): AgentMove {
      return toMove(repo.claimForAgent(planId, id, tokenId, at));
    },

    moveForAgent(
      planId: string,
      id: string,
      tokenId: string,
      to: "review" | "todo",
    ): AgentMove {
      return toMove(repo.moveForAgent(planId, id, tokenId, to));
    },
  };
}

export type TasksService = ReturnType<typeof createTasksService>;
