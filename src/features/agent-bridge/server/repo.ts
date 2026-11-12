import "server-only";

import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { type Db, getDb } from "@/server/db/client";
import { planAgentTokens, taskNotes } from "@/server/db/schema";
import type { TaskNoteAuthor, TaskNoteKind } from "../schemas";

export type PlanTokenRow = typeof planAgentTokens.$inferSelect;
export type TaskNoteRow = typeof taskNotes.$inferSelect & { tokenLabel: string | null };

/** Satu-satunya tempat yang tahu tabel `plan_agent_tokens` dan `task_notes` (ADR 0017). */
export function createAgentBridgeRepo(db: Db) {
  const noteColumns = {
    id: taskNotes.id,
    taskId: taskNotes.taskId,
    planId: taskNotes.planId,
    author: taskNotes.author,
    kind: taskNotes.kind,
    body: taskNotes.body,
    tokenId: taskNotes.tokenId,
    createdAt: taskNotes.createdAt,
    tokenLabel: planAgentTokens.label,
  };

  return {
    insertToken(values: {
      planId: string;
      label: string;
      tokenHash: string;
      expiresAt: Date;
    }): PlanTokenRow {
      return db.insert(planAgentTokens).values(values).returning().get();
    },

    listTokens(planId: string): PlanTokenRow[] {
      return db
        .select()
        .from(planAgentTokens)
        .where(eq(planAgentTokens.planId, planId))
        .orderBy(desc(planAgentTokens.createdAt), desc(sql`${planAgentTokens}.rowid`))
        .all();
    },

    countActiveTokens(planId: string, now: Date): number {
      return (
        db
          .select({ n: sql<number>`count(*)` })
          .from(planAgentTokens)
          .where(
            and(
              eq(planAgentTokens.planId, planId),
              isNull(planAgentTokens.revokedAt),
              gt(planAgentTokens.expiresAt, now),
            ),
          )
          .get()?.n ?? 0
      );
    },

    findToken(id: string): PlanTokenRow | undefined {
      return db.select().from(planAgentTokens).where(eq(planAgentTokens.id, id)).get();
    },

    findTokenByHash(tokenHash: string): PlanTokenRow | undefined {
      return db
        .select()
        .from(planAgentTokens)
        .where(eq(planAgentTokens.tokenHash, tokenHash))
        .get();
    },

    /** Mencabut satu token plan (`id` plan lain diabaikan). @returns true bila ada yang dicabut. */
    revokeToken(planId: string, id: string, now: Date): boolean {
      return (
        db
          .update(planAgentTokens)
          .set({ revokedAt: now })
          .where(
            and(
              eq(planAgentTokens.id, id),
              eq(planAgentTokens.planId, planId),
              isNull(planAgentTokens.revokedAt),
            ),
          )
          .run().changes > 0
      );
    },

    revokeAll(planId: string, now: Date): number {
      return db
        .update(planAgentTokens)
        .set({ revokedAt: now })
        .where(and(eq(planAgentTokens.planId, planId), isNull(planAgentTokens.revokedAt)))
        .run().changes;
    },

    /**
     * Mencatat satu permintaan di jendela batas laju dan `last_used_at`. Dihitung di database (bukan di
     * memori) karena Next memuat modul server lebih dari sekali (sama dengan token M7).
     * @returns jumlah permintaan di jendela sekarang, termasuk yang ini.
     */
    countUse(id: string, now: Date, windowMs: number): number {
      return db.transaction((tx) => {
        const row = tx
          .select()
          .from(planAgentTokens)
          .where(eq(planAgentTokens.id, id))
          .get();
        if (!row) return 0;
        const fresh =
          !row.windowStartedAt ||
          now.getTime() - row.windowStartedAt.getTime() >= windowMs;
        const count = fresh ? 1 : row.windowCount + 1;
        tx.update(planAgentTokens)
          .set({
            windowStartedAt: fresh ? now : row.windowStartedAt,
            windowCount: count,
            lastUsedAt: now,
          })
          .where(eq(planAgentTokens.id, id))
          .run();
        return count;
      });
    },

    insertNote(values: {
      taskId: string;
      planId: string;
      author: TaskNoteAuthor;
      kind: TaskNoteKind;
      body: string;
      tokenId?: string | null;
      createdAt?: Date;
    }): TaskNoteRow {
      const row = db.insert(taskNotes).values(values).returning().get();
      const label = row.tokenId
        ? (db
            .select({ label: planAgentTokens.label })
            .from(planAgentTokens)
            .where(eq(planAgentTokens.id, row.tokenId))
            .get()?.label ?? null)
        : null;
      return { ...row, tokenLabel: label };
    },

    listNotes(taskId: string): TaskNoteRow[] {
      return db
        .select(noteColumns)
        .from(taskNotes)
        .leftJoin(planAgentTokens, eq(planAgentTokens.id, taskNotes.tokenId))
        .where(eq(taskNotes.taskId, taskId))
        .orderBy(asc(taskNotes.createdAt), asc(sql`${taskNotes}.rowid`))
        .all();
    },

    countNotes(taskId: string): number {
      return (
        db
          .select({ n: sql<number>`count(*)` })
          .from(taskNotes)
          .where(eq(taskNotes.taskId, taskId))
          .get()?.n ?? 0
      );
    },

    /** Semua catatan plan, urut waktu (untuk meta kanban; satu plan pribadi berisi sedikit catatan). */
    listPlanNotes(planId: string): TaskNoteRow[] {
      return db
        .select(noteColumns)
        .from(taskNotes)
        .leftJoin(planAgentTokens, eq(planAgentTokens.id, taskNotes.tokenId))
        .where(eq(taskNotes.planId, planId))
        .orderBy(asc(taskNotes.createdAt), asc(sql`${taskNotes}.rowid`))
        .all();
    },
  };
}

export type AgentBridgeRepo = ReturnType<typeof createAgentBridgeRepo>;

export const getAgentBridgeRepo = (): AgentBridgeRepo => createAgentBridgeRepo(getDb());
