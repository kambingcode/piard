import "server-only";

import { and, asc, eq, inArray, max, notInArray, sql } from "drizzle-orm";
import { type Db, getDb } from "@/server/db/client";
import { features, plans, tasks } from "@/server/db/schema";
import { KEPT_ON_REGENERATE, type TaskDraft, type TaskStatus } from "../schemas";

export type TaskRow = typeof tasks.$inferSelect;
export type TaskUpdate = Partial<
  Pick<
    typeof tasks.$inferInsert,
    "title" | "description" | "prompt" | "status" | "position"
  >
>;

/** Hasil klaim/transisi agen; penolakan membawa baris saat ini agar pesan bisa menyebut statusnya. */
export type AgentMoveResult =
  | { kind: "ok"; row: TaskRow; already: boolean }
  | { kind: "not_found" }
  | { kind: "conflict"; row: TaskRow }
  | { kind: "busy"; held: TaskRow };

/**
 * Perubahan status oleh pengguna melepas klaim agen (ADR 0017), kecuali statusnya tidak berubah. Dinilai
 * SQLite per baris dengan nilai lama, jadi berlaku sama untuk satu task maupun status massal.
 */
const releaseClaimUnless = (status: TaskStatus) => ({
  agentTokenId: sql<
    string | null
  >`CASE WHEN ${tasks.status} = ${status} THEN ${tasks.agentTokenId} ELSE NULL END`,
  claimedAt: sql<Date | null>`CASE WHEN ${tasks.status} = ${status} THEN ${tasks.claimedAt} ELSE NULL END`,
});

const NO_CLAIM = { agentTokenId: null, claimedAt: null } as const;

/** Satu-satunya tempat di fitur tasks yang tahu tabel `tasks`. */
export function createTasksRepo(db: Db) {
  const findInPlan = (planId: string, id: string): TaskRow | undefined =>
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.planId, planId)))
      .get();

  return {
    findInPlan,

    /** Task `doing` yang dipegang token (paling banyak satu, lihat `claimForAgent`). */
    heldByAgent(planId: string, tokenId: string): TaskRow | undefined {
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.planId, planId),
            eq(tasks.agentTokenId, tokenId),
            eq(tasks.status, "doing"),
          ),
        )
        .get();
    },

    /** Task `todo` pertama menurut posisi fitur di roadmap lalu posisi task. */
    nextTodo(planId: string): TaskRow | undefined {
      return db
        .select({ task: tasks })
        .from(tasks)
        .innerJoin(features, eq(features.id, tasks.featureId))
        .where(and(eq(tasks.planId, planId), eq(tasks.status, "todo")))
        .orderBy(asc(features.position), asc(tasks.position), asc(sql`${tasks}.rowid`))
        .limit(1)
        .get()?.task;
    },

    /**
     * Klaim atomik `todo → doing` untuk token. Klaim ulang oleh token yang sama idempoten; token yang
     * sudah memegang task `doing` lain ditolak (`busy`). Dua token yang berebut: hanya satu `UPDATE`
     * yang menemukan `status = 'todo'`.
     */
    claimForAgent(
      planId: string,
      id: string,
      tokenId: string,
      at: Date,
    ): AgentMoveResult {
      return db.transaction((tx) => {
        const row = tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, id), eq(tasks.planId, planId)))
          .get();
        if (!row) return { kind: "not_found" };
        if (row.status === "doing" && row.agentTokenId === tokenId)
          return { kind: "ok", row, already: true };
        const held = tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.planId, planId),
              eq(tasks.agentTokenId, tokenId),
              eq(tasks.status, "doing"),
            ),
          )
          .get();
        if (held) return { kind: "busy", held };
        const claimed = tx
          .update(tasks)
          .set({ status: "doing", agentTokenId: tokenId, claimedAt: at })
          .where(and(eq(tasks.id, id), eq(tasks.status, "todo")))
          .returning()
          .get();
        return claimed
          ? { kind: "ok", row: claimed, already: false }
          : { kind: "conflict", row };
      });
    },

    /**
     * Transisi agen dari `doing` miliknya: `review` (lapor, klaim tetap tercatat) atau `todo` (lepas,
     * klaim dihapus). Lapor ulang task yang sudah `review` oleh token yang sama idempoten.
     */
    moveForAgent(
      planId: string,
      id: string,
      tokenId: string,
      to: "review" | "todo",
    ): AgentMoveResult {
      return db.transaction((tx) => {
        const row = tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, id), eq(tasks.planId, planId)))
          .get();
        if (!row) return { kind: "not_found" };
        if (to === "review" && row.status === "review" && row.agentTokenId === tokenId)
          return { kind: "ok", row, already: true };
        const moved = tx
          .update(tasks)
          .set(to === "review" ? { status: "review" } : { status: "todo", ...NO_CLAIM })
          .where(
            and(
              eq(tasks.id, id),
              eq(tasks.status, "doing"),
              eq(tasks.agentTokenId, tokenId),
            ),
          )
          .returning()
          .get();
        return moved
          ? { kind: "ok", row: moved, already: false }
          : { kind: "conflict", row };
      });
    },

    /**
     * Transisi pengguna bersyarat (tinjauan, lepas card agen): hanya bila status sekarang salah satu
     * `from`. Klaim agen dilepas. @returns baris baru, atau undefined bila status sudah berubah.
     */
    moveIf(id: string, from: readonly TaskStatus[], to: TaskStatus): TaskRow | undefined {
      return db
        .update(tasks)
        .set({ status: to, ...NO_CLAIM })
        .where(and(eq(tasks.id, id), inArray(tasks.status, [...from])))
        .returning()
        .get();
    },

    /** Task plan (opsional satu fitur), urut fitur lalu posisi. */
    listByPlan(planId: string, featureId?: string): TaskRow[] {
      return db
        .select({ task: tasks })
        .from(tasks)
        .innerJoin(features, eq(features.id, tasks.featureId))
        .where(
          and(
            eq(tasks.planId, planId),
            featureId === undefined ? undefined : eq(tasks.featureId, featureId),
          ),
        )
        .orderBy(asc(features.position), asc(tasks.position), asc(sql`${tasks}.rowid`))
        .all()
        .map((row) => row.task);
    },

    countByFeature(planId: string): Map<string, number> {
      const rows = db
        .select({ featureId: tasks.featureId, n: sql<number>`count(*)` })
        .from(tasks)
        .where(eq(tasks.planId, planId))
        .groupBy(tasks.featureId)
        .all();
      return new Map(rows.map((r) => [r.featureId, r.n]));
    },

    /** Task milik `userId`; milik orang lain diperlakukan seperti tidak ada. */
    findOwned(userId: string, id: string): TaskRow | undefined {
      return db
        .select({ task: tasks })
        .from(tasks)
        .innerJoin(plans, eq(plans.id, tasks.planId))
        .where(and(eq(tasks.id, id), eq(plans.userId, userId)))
        .get()?.task;
    },

    /** Fitur milik `userId` (untuk menempelkan task); `undefined` bila tidak ada. */
    findOwnedFeature(
      userId: string,
      featureId: string,
    ): { id: string; planId: string; parentId: string | null } | undefined {
      return db
        .select({ id: features.id, planId: features.planId, parentId: features.parentId })
        .from(features)
        .innerJoin(plans, eq(plans.id, features.planId))
        .where(and(eq(features.id, featureId), eq(plans.userId, userId)))
        .get();
    },

    insert(values: {
      planId: string;
      featureId: string;
      title: string;
      description: string;
      prompt: string;
    }): TaskRow {
      return db.transaction((tx) => {
        const last = tx
          .select({ last: max(tasks.position) })
          .from(tasks)
          .where(eq(tasks.featureId, values.featureId))
          .get();
        const position =
          last?.last === null || last?.last === undefined ? 0 : last.last + 1;
        return tx
          .insert(tasks)
          .values({ ...values, position })
          .returning()
          .get();
      });
    },

    update(id: string, patch: TaskUpdate): TaskRow | undefined {
      const claim = patch.status === undefined ? {} : releaseClaimUnless(patch.status);
      return db
        .update(tasks)
        .set({ ...patch, ...claim })
        .where(eq(tasks.id, id))
        .returning()
        .get();
    },

    delete(id: string): boolean {
      return db.delete(tasks).where(eq(tasks.id, id)).run().changes > 0;
    },

    /** Mengubah status banyak task milik satu plan; id plan lain diabaikan. @returns jumlah berubah. */
    setStatus(planId: string, ids: string[], status: TaskStatus): number {
      return db
        .update(tasks)
        .set({ status, ...releaseClaimUnless(status) })
        .where(and(eq(tasks.planId, planId), inArray(tasks.id, ids)))
        .run().changes;
    },

    resetStatus(planId: string): number {
      return db
        .update(tasks)
        .set({ status: "todo", ...NO_CLAIM })
        .where(eq(tasks.planId, planId))
        .run().changes;
    },

    /**
     * Mengganti task satu fitur dalam satu transaksi (hasil AI). Fitur yang sudah dihapus (mis. roadmap
     * dibuat ulang selama job) dilewati. Task `doing`/`review` (pekerjaan agen atau pengguna yang belum
     * ditinjau) dipertahankan dan task baru ditaruh sesudahnya (ADR 0017).
     * @returns false bila fitur sudah tidak ada.
     */
    replaceForFeature(planId: string, featureId: string, drafts: TaskDraft[]): boolean {
      return db.transaction((tx) => {
        const exists = tx
          .select({ id: features.id })
          .from(features)
          .where(and(eq(features.id, featureId), eq(features.planId, planId)))
          .get();
        if (!exists) return false;
        tx.delete(tasks)
          .where(
            and(
              eq(tasks.featureId, featureId),
              notInArray(tasks.status, [...KEPT_ON_REGENERATE]),
            ),
          )
          .run();
        const kept = tx
          .select({ last: max(tasks.position) })
          .from(tasks)
          .where(eq(tasks.featureId, featureId))
          .get();
        const start = kept?.last === null || kept?.last === undefined ? 0 : kept.last + 1;
        drafts.forEach((draft, i) => {
          tx.insert(tasks)
            .values({ planId, featureId, position: start + i, ...draft })
            .run();
        });
        return true;
      });
    },

    /** Menghapus task plan untuk "buat ulang", kecuali `doing`/`review` (lihat `replaceForFeature`). */
    deleteByPlan(planId: string): void {
      db.delete(tasks)
        .where(
          and(
            eq(tasks.planId, planId),
            notInArray(tasks.status, [...KEPT_ON_REGENERATE]),
          ),
        )
        .run();
    },
  };
}

export type TasksRepo = ReturnType<typeof createTasksRepo>;

export const getTasksRepo = (): TasksRepo => createTasksRepo(getDb());
