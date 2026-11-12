import { beforeEach, describe, expect, it } from "vitest";
import { createPlansRepo } from "@/features/plans/server/repo";
import { createPlansService } from "@/features/plans/server/service";
import { patchTaskSchema } from "@/features/tasks";
import { createTasksRepo } from "@/features/tasks/server/repo";
import { createTasksService, type TasksService } from "@/features/tasks/server/service";
import type { DbHandle } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { seedAgentToken, seedBoard } from "../helpers/plan-seed";
import { createTestDb, seedUser } from "../helpers/test-db";

/** M8-02: status `review`, klaim agen di tabel `tasks`, dan job yang tidak menimpa pekerjaan agen. */

let handle: DbHandle;
let service: TasksService;
let userId: string;
let board: ReturnType<typeof seedBoard>;
let tokenA: string;
let tokenB: string;
const at = new Date("2026-10-31T10:00:00Z");

const taskId = (feature: number, i: number) => {
  const row = board.features[feature]?.tasks[i];
  if (!row) throw new Error("task seed tidak ada");
  return row.id;
};

beforeEach(() => {
  handle = createTestDb();
  userId = seedUser(handle.db).id;
  service = createTasksService({
    plans: createPlansService(createPlansRepo(handle.db)),
    repo: createTasksRepo(handle.db),
  });
  board = seedBoard(handle.db, userId);
  tokenA = seedAgentToken(handle.db, board.plan.id, "A").id;
  tokenB = seedAgentToken(handle.db, board.plan.id, "B").id;
});

describe("status review", () => {
  it("skema menerima review dan pengguna bisa memindahkan ke/dari review", () => {
    expect(patchTaskSchema.parse({ status: "review" })).toEqual({ status: "review" });
    const id = taskId(0, 0);
    expect(service.updateTask(userId, id, { status: "review" }).status).toBe("review");
    expect(
      service.bulkStatus(userId, { planId: board.plan.id, ids: [id], status: "done" }),
    ).toEqual({ updated: 1 });
    expect(service.getOwned(userId, id).status).toBe("done");
  });
});

describe("klaim agen", () => {
  it("todo → doing atomik; token lain kalah; klaim ulang idempoten", () => {
    const id = taskId(0, 0);
    const first = service.claimForAgent(board.plan.id, id, tokenA, at);
    expect(first).toMatchObject({ kind: "ok", already: false });
    if (first.kind === "ok") {
      expect(first.task).toMatchObject({
        status: "doing",
        agentTokenId: tokenA,
        claimedAt: at.toISOString(),
      });
    }
    expect(service.claimForAgent(board.plan.id, id, tokenB, at)).toMatchObject({
      kind: "conflict",
      task: { status: "doing", agentTokenId: tokenA },
    });
    expect(service.claimForAgent(board.plan.id, id, tokenA, at)).toMatchObject({
      kind: "ok",
      already: true,
    });
  });

  it("satu task doing per token", () => {
    service.claimForAgent(board.plan.id, taskId(0, 0), tokenA, at);
    expect(service.claimForAgent(board.plan.id, taskId(0, 1), tokenA, at)).toMatchObject({
      kind: "busy",
      held: { id: taskId(0, 0) },
    });
    expect(service.claimForAgent(board.plan.id, taskId(0, 1), tokenB, at).kind).toBe(
      "ok",
    );
  });

  it("task plan lain tidak ditemukan", () => {
    const other = seedBoard(handle.db, seedUser(handle.db, "lain@piard.local").id);
    const foreign = other.features[0]?.tasks[0]?.id ?? "";
    expect(service.claimForAgent(board.plan.id, foreign, tokenA, at).kind).toBe(
      "not_found",
    );
    expect(service.moveForAgent(board.plan.id, foreign, tokenA, "review").kind).toBe(
      "not_found",
    );
    expect(service.findInPlan(board.plan.id, foreign)).toBeUndefined();
  });

  it("lapor dan lepas hanya dari doing milik token", () => {
    const id = taskId(0, 0);
    expect(service.moveForAgent(board.plan.id, id, tokenA, "review").kind).toBe(
      "conflict",
    );
    service.claimForAgent(board.plan.id, id, tokenA, at);
    expect(service.moveForAgent(board.plan.id, id, tokenB, "review").kind).toBe(
      "conflict",
    );
    expect(service.moveForAgent(board.plan.id, id, tokenA, "review")).toMatchObject({
      kind: "ok",
      already: false,
      task: { status: "review", agentTokenId: tokenA },
    });
    // Lapor ulang idempoten; lepas dari review ditolak; agen tidak bisa menyentuh done.
    expect(service.moveForAgent(board.plan.id, id, tokenA, "review")).toMatchObject({
      kind: "ok",
      already: true,
    });
    expect(service.moveForAgent(board.plan.id, id, tokenA, "todo").kind).toBe("conflict");
    service.updateTask(userId, id, { status: "done" });
    expect(service.moveForAgent(board.plan.id, id, tokenA, "review").kind).toBe(
      "conflict",
    );
    expect(service.claimForAgent(board.plan.id, id, tokenA, at).kind).toBe("conflict");
  });

  it("lepas mengembalikan todo tanpa klaim", () => {
    const id = taskId(0, 0);
    service.claimForAgent(board.plan.id, id, tokenA, at);
    expect(service.moveForAgent(board.plan.id, id, tokenA, "todo")).toMatchObject({
      kind: "ok",
      task: { status: "todo", agentTokenId: null, claimedAt: null },
    });
  });

  it("task berikutnya mengikuti posisi fitur lalu posisi task", () => {
    expect(service.nextTodo(board.plan.id)?.id).toBe(taskId(0, 0));
    service.updateTask(userId, taskId(0, 0), { status: "done" });
    service.updateTask(userId, taskId(0, 1), { status: "review" });
    expect(service.nextTodo(board.plan.id)?.id).toBe(taskId(1, 0));
    service.updateTask(userId, taskId(1, 0), { status: "doing" });
    expect(service.nextTodo(board.plan.id)).toBeUndefined();
  });
});

describe("perubahan status oleh pengguna melepas klaim", () => {
  it("PATCH, massal, dan reset; status sama tidak melepas", () => {
    const [a, b] = [taskId(0, 0), taskId(1, 0)];
    service.claimForAgent(board.plan.id, a, tokenA, at);
    service.claimForAgent(board.plan.id, b, tokenB, at);
    expect(service.updateTask(userId, a, { title: "Judul baru" }).agentTokenId).toBe(
      tokenA,
    );
    expect(service.updateTask(userId, a, { status: "doing" }).agentTokenId).toBe(tokenA);
    expect(service.updateTask(userId, a, { status: "todo" })).toMatchObject({
      agentTokenId: null,
      claimedAt: null,
    });
    service.bulkStatus(userId, { planId: board.plan.id, ids: [b], status: "review" });
    expect(service.getOwned(userId, b).agentTokenId).toBeNull();

    service.claimForAgent(board.plan.id, a, tokenA, at);
    service.resetTasks(userId, board.plan.id);
    expect(service.getOwned(userId, a)).toMatchObject({
      status: "todo",
      agentTokenId: null,
    });
  });

  it("transisi bersyarat pengguna: Setujui hanya dari review", () => {
    const id = taskId(0, 0);
    expect(() => service.moveOwnedIf(userId, id, ["review"], "done")).toThrow(AppError);
    service.claimForAgent(board.plan.id, id, tokenA, at);
    service.moveForAgent(board.plan.id, id, tokenA, "review");
    expect(service.moveOwnedIf(userId, id, ["review"], "done")).toMatchObject({
      status: "done",
      agentTokenId: null,
    });
    const other = seedUser(handle.db, "c@piard.local").id;
    expect(() => service.moveOwnedIf(other, id, ["done"], "todo")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});

describe("job tidak menimpa pekerjaan agen", () => {
  it("replaceForFeature mempertahankan doing/review dan menaruh task baru sesudahnya", () => {
    const [doing, review] = [taskId(0, 0), taskId(0, 1)];
    service.claimForAgent(board.plan.id, doing, tokenA, at);
    service.claimForAgent(board.plan.id, review, tokenB, at);
    service.moveForAgent(board.plan.id, review, tokenB, "review");
    const featureId = board.features[0]?.feature.id ?? "";
    service.replaceForFeature(board.plan.id, featureId, [
      { title: "Baru", description: "", prompt: "p" },
    ]);
    const list = service.listTasks(userId, board.plan.id, featureId);
    expect(list.map((t) => [t.title, t.status])).toEqual([
      ["Task 1.1", "doing"],
      ["Task 1.2", "review"],
      ["Baru", "todo"],
    ]);
    expect(list.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("clearPlan menghapus todo/done tetapi tidak doing/review", () => {
    service.claimForAgent(board.plan.id, taskId(0, 0), tokenA, at);
    service.updateTask(userId, taskId(0, 1), { status: "done" });
    service.clearPlan(board.plan.id);
    expect(service.listTasks(userId, board.plan.id).map((t) => t.id)).toEqual([
      taskId(0, 0),
    ]);
  });
});
