import "server-only";

import type { TasksService } from "@/features/tasks/server";
import { AppError } from "@/server/http/errors";
import { agentBridgeCopy } from "../copy";
import { NOTES_PER_TASK_MAX } from "../limits";
import type {
  BoardCardMeta,
  BoardMeta,
  ReviewInput,
  TaskEvent,
  TaskNote,
} from "../schemas";
import { toTaskNote } from "./agent-api";
import type { BoardEvent } from "./events";
import type { AgentBridgeRepo, TaskNoteRow } from "./repo";
import type { TokenService } from "./tokens";

type Deps = {
  repo: AgentBridgeRepo;
  tasks: Pick<TasksService, "getOwned" | "moveOwnedIf" | "listTasks">;
  tokens: Pick<TokenService, "labels">;
  publish: (event: BoardEvent) => void;
  now?: () => Date;
};

const latest = (a: string | null, b: Date) => {
  const iso = b.toISOString();
  return a === null || iso > a ? iso : a;
};

/**
 * Sisi pengguna jembatan agen (M8-03, M8-07, M8-11): linimasa catatan card, balasan, tinjauan (Setujui,
 * Minta perbaikan), melepas card agen yang macet, dan keadaan agen per card untuk kanban.
 */
export function createBoardService(deps: Deps) {
  const { repo, tasks, tokens, publish } = deps;
  const now = deps.now ?? (() => new Date());

  function addUserNote(
    taskId: string,
    planId: string,
    kind: "note" | "event",
    body: string,
  ) {
    return repo.insertNote({
      taskId,
      planId,
      author: "user",
      kind,
      body,
      createdAt: now(),
    });
  }

  function requireNoteRoom(taskId: string, adding: number) {
    if (repo.countNotes(taskId) + adding > NOTES_PER_TASK_MAX) {
      throw new AppError(
        "CONFLICT",
        agentBridgeCopy.errors.tooManyNotes(NOTES_PER_TASK_MAX),
      );
    }
  }

  return {
    notes(userId: string, taskId: string): TaskNote[] {
      const task = tasks.getOwned(userId, taskId);
      return repo.listNotes(task.id).map(toTaskNote);
    },

    /** Catatan atau jawaban pengguna; menutup pertanyaan agen yang terbuka. */
    addNote(userId: string, taskId: string, body: string): TaskNote {
      const task = tasks.getOwned(userId, taskId);
      requireNoteRoom(task.id, 1);
      const note = addUserNote(task.id, task.planId, "note", body);
      publish({
        planId: task.planId,
        taskId: task.id,
        status: task.status,
        reason: "note",
      });
      return toTaskNote(note);
    },

    /**
     * Setujui (`review → done`) atau Minta perbaikan (`review → todo` dengan catatan yang dibaca agen).
     * @throws {AppError} `CONFLICT` bila card sudah tidak di Review.
     */
    review(userId: string, taskId: string, input: ReviewInput) {
      const current = tasks.getOwned(userId, taskId);
      requireNoteRoom(current.id, 2);
      const approve = input.decision === "approve";
      const task = tasks.moveOwnedIf(
        userId,
        taskId,
        ["review"],
        approve ? "done" : "todo",
      );
      if (!approve) addUserNote(task.id, task.planId, "note", input.note);
      const code: TaskEvent = approve ? "approve" : "changes";
      addUserNote(task.id, task.planId, "event", code);
      publish({
        planId: task.planId,
        taskId: task.id,
        status: task.status,
        reason: "review",
      });
      return { task };
    },

    /** Mengambil kembali card `doing` milik agen (mis. "mungkin macet") ke Todo. */
    release(userId: string, taskId: string) {
      const current = tasks.getOwned(userId, taskId);
      if (current.status !== "doing" || !current.agentTokenId) {
        throw new AppError("CONFLICT", agentBridgeCopy.errors.notAgentCard);
      }
      requireNoteRoom(current.id, 1);
      const task = tasks.moveOwnedIf(userId, taskId, ["doing"], "todo");
      addUserNote(task.id, task.planId, "event", "user_release");
      publish({
        planId: task.planId,
        taskId: task.id,
        status: task.status,
        reason: "review",
      });
      return { task };
    },

    /** Keadaan agen per card: label token, waktu klaim, kabar terakhir, pertanyaan terbuka. */
    meta(userId: string, planId: string): BoardMeta {
      const list = tasks.listTasks(userId, planId);
      const labels = tokens.labels(planId);
      const byTask = new Map<string, TaskNoteRow[]>();
      for (const note of repo.listPlanNotes(planId)) {
        const notes = byTask.get(note.taskId) ?? [];
        notes.push(note);
        byTask.set(note.taskId, notes);
      }
      const cards: Record<string, BoardCardMeta> = {};
      for (const task of list) {
        const notes = byTask.get(task.id) ?? [];
        let lastAgentAt = task.claimedAt;
        let openQuestion = false;
        for (const note of notes) {
          if (note.author === "agent") {
            if (task.claimedAt) lastAgentAt = latest(lastAgentAt, note.createdAt);
            if (note.kind === "question") openQuestion = true;
          } else if (note.kind === "note") {
            openQuestion = false;
          }
        }
        cards[task.id] = {
          tokenLabel: task.agentTokenId ? (labels.get(task.agentTokenId) ?? null) : null,
          claimedAt: task.claimedAt,
          lastAgentAt,
          openQuestion,
          notes: notes.filter((n) => n.kind !== "event").length,
        };
      }
      return { cards };
    },
  };
}

export type BoardService = ReturnType<typeof createBoardService>;
