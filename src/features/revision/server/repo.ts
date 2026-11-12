import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FeatureChange } from "@/features/roadmap";
import { type Db, getDb } from "@/server/db/client";
import type { MessagePart } from "@/server/db/json-types";
import { planMessages, plans, syncProposals } from "@/server/db/schema";
import type { ChatRole, ProposalScope, ProposalStatus } from "../schemas";

export type MessageRow = typeof planMessages.$inferSelect;
export type ProposalRow = typeof syncProposals.$inferSelect;

/** Satu-satunya tempat di fitur revisi yang tahu tabel `plan_messages` dan `sync_proposals`. */
export function createRevisionRepo(db: Db) {
  return {
    /** `limit` pesan terakhir plan, urut lama ke baru. */
    listMessages(planId: string, limit?: number): MessageRow[] {
      const query = db
        .select()
        .from(planMessages)
        .where(eq(planMessages.planId, planId))
        .orderBy(desc(planMessages.createdAt), desc(sql`rowid`));
      return (limit === undefined ? query.all() : query.limit(limit).all()).reverse();
    },

    insertMessage(planId: string, role: ChatRole, parts: MessagePart[]): MessageRow {
      return db.insert(planMessages).values({ planId, role, parts }).returning().get();
    },

    deleteMessage(id: string): void {
      db.delete(planMessages).where(eq(planMessages.id, id)).run();
    },

    insertProposal(
      planId: string,
      scope: ProposalScope,
      ops: FeatureChange[],
    ): ProposalRow {
      return db.insert(syncProposals).values({ planId, scope, ops }).returning().get();
    },

    findProposal(planId: string, id: string): ProposalRow | undefined {
      return db
        .select()
        .from(syncProposals)
        .where(and(eq(syncProposals.id, id), eq(syncProposals.planId, planId)))
        .get();
    },

    /** Usulan milik `userId`; milik orang lain diperlakukan seperti tidak ada. */
    findOwnedProposal(userId: string, id: string): ProposalRow | undefined {
      const row = db
        .select({ proposal: syncProposals })
        .from(syncProposals)
        .innerJoin(plans, eq(plans.id, syncProposals.planId))
        .where(and(eq(syncProposals.id, id), eq(plans.userId, userId)))
        .get();
      return row?.proposal;
    },

    /** Usulan yang menunggu keputusan, terbaru dulu. */
    listPending(planId: string): ProposalRow[] {
      return db
        .select()
        .from(syncProposals)
        .where(and(eq(syncProposals.planId, planId), eq(syncProposals.status, "pending")))
        .orderBy(desc(syncProposals.createdAt), asc(sql`rowid`))
        .all();
    },

    /**
     * Memutuskan usulan yang masih `pending`. @returns false bila sudah diputuskan lebih dulu
     * (mis. klik ganda di dua tab), sehingga perubahan tidak diterapkan dua kali.
     */
    resolve(id: string, status: Exclude<ProposalStatus, "pending">): boolean {
      return (
        db
          .update(syncProposals)
          .set({ status })
          .where(and(eq(syncProposals.id, id), eq(syncProposals.status, "pending")))
          .run().changes > 0
      );
    },

    /** Usulan lama dari lingkup yang sama digantikan usulan baru (ditandai ditolak, tidak dihapus). */
    supersedePending(planId: string, scope: ProposalScope): void {
      db.update(syncProposals)
        .set({ status: "rejected" })
        .where(
          and(
            eq(syncProposals.planId, planId),
            eq(syncProposals.scope, scope),
            eq(syncProposals.status, "pending"),
          ),
        )
        .run();
    },

    /** Menjalankan beberapa panggilan sebagai satu transaksi (better-sqlite3 sinkron). */
    atomic<T>(work: () => T): T {
      return db.transaction(() => work());
    },
  };
}

export type RevisionRepo = ReturnType<typeof createRevisionRepo>;

export const getRevisionRepo = (): RevisionRepo => createRevisionRepo(getDb());
