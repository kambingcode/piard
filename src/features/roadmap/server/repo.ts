import "server-only";

import { and, asc, eq, isNull, max, sql } from "drizzle-orm";
import { type Db, getDb } from "@/server/db/client";
import { features, plans } from "@/server/db/schema";
import type { NormalizedFeature } from "../ai/roadmap.normalize";

export type FeatureRow = typeof features.$inferSelect;
export type FeatureUpdate = Partial<
  Pick<typeof features.$inferInsert, "name" | "summary" | "phase" | "status" | "position">
>;

type Owner = { planId: string; workspaceId: string };

/** Satu-satunya tempat di fitur roadmap yang tahu tabel `features`. */
export function createRoadmapRepo(db: Db) {
  return {
    /**
     * Menjalankan beberapa panggilan repo sebagai satu transaksi. better-sqlite3 sinkron, jadi
     * pernyataan lewat `db` di dalam `work` ikut transaksi yang sama.
     */
    atomic<T>(work: () => T): T {
      return db.transaction(() => work());
    },

    /** Semua fitur dan sub-fitur plan, urut posisi. */
    listByPlan(planId: string): FeatureRow[] {
      return db
        .select()
        .from(features)
        .where(eq(features.planId, planId))
        .orderBy(asc(features.position), asc(features.createdAt), asc(sql`rowid`))
        .all();
    },

    countTopLevel(planId: string): number {
      const row = db
        .select({ n: sql<number>`count(*)` })
        .from(features)
        .where(and(eq(features.planId, planId), isNull(features.parentId)))
        .get();
      return row?.n ?? 0;
    },

    /** Menghapus seluruh roadmap plan (sub-fitur ikut terhapus lewat kunci asing). */
    clearPlan(planId: string): void {
      db.delete(features).where(eq(features.planId, planId)).run();
    },

    /** Fitur beserta sub-fiturnya dalam satu transaksi. @returns id fitur. */
    insertTree(owner: Owner, position: number, feature: NormalizedFeature): string {
      return db.transaction((tx) => {
        const parent = tx
          .insert(features)
          .values({
            ...owner,
            name: feature.name,
            summary: feature.summary,
            icon: feature.icon,
            phase: feature.phase,
            position,
            source: "ai",
          })
          .returning({ id: features.id })
          .get();
        feature.subFeatures.forEach((sub, index) => {
          tx.insert(features)
            .values({
              ...owner,
              parentId: parent.id,
              name: sub.name,
              summary: sub.summary,
              icon: sub.icon,
              phase: feature.phase,
              position: index,
              source: "ai",
            })
            .run();
        });
        return parent.id;
      });
    },

    /** Menetapkan posisi dan fase akhir fitur (dan fase sub-fiturnya) dalam satu transaksi. */
    applyOrder(updates: { id: string; position: number; phase: number }[]): void {
      db.transaction((tx) => {
        for (const { id, position, phase } of updates) {
          tx.update(features).set({ position, phase }).where(eq(features.id, id)).run();
          tx.update(features).set({ phase }).where(eq(features.parentId, id)).run();
        }
      });
    },

    /** Fitur/sub-fitur milik `userId`; milik orang lain diperlakukan seperti tidak ada. */
    findOwned(userId: string, id: string): FeatureRow | undefined {
      const row = db
        .select({ feature: features })
        .from(features)
        .innerJoin(plans, eq(plans.id, features.planId))
        .where(and(eq(features.id, id), eq(plans.userId, userId)))
        .get();
      return row?.feature;
    },

    insertOne(
      values: Owner & {
        parentId: string | null;
        name: string;
        summary: string;
        icon: string;
        phase: number | null;
        position: number;
      },
    ): FeatureRow {
      return db
        .insert(features)
        .values({ ...values, source: "user" })
        .returning()
        .get();
    },

    update(id: string, patch: FeatureUpdate): FeatureRow | undefined {
      return db.transaction((tx) => {
        const row = tx
          .update(features)
          .set(patch)
          .where(eq(features.id, id))
          .returning()
          .get();
        // Sub-fitur selalu mengikuti fase induknya (seperti contoh situs acuan).
        if (row && patch.phase !== undefined) {
          tx.update(features)
            .set({ phase: patch.phase })
            .where(eq(features.parentId, id))
            .run();
        }
        return row;
      });
    },

    delete(id: string): boolean {
      return db.delete(features).where(eq(features.id, id)).run().changes > 0;
    },

    /**
     * Menyimpan spesifikasi beberapa fitur/sub-fitur plan dalam satu transaksi. Baris yang sudah tidak
     * ada (roadmap dibuat ulang selama job) dilewati. @returns jumlah baris yang diperbarui.
     */
    setSpecs(planId: string, specs: { id: string; spec: string }[]): number {
      return db.transaction((tx) => {
        let changed = 0;
        for (const { id, spec } of specs) {
          changed += tx
            .update(features)
            .set({ spec })
            .where(and(eq(features.id, id), eq(features.planId, planId)))
            .run().changes;
        }
        return changed;
      });
    },

    clearSpecs(planId: string): void {
      db.update(features).set({ spec: "" }).where(eq(features.planId, planId)).run();
    },

    /** Posisi berikutnya di akhir daftar (fitur level atas bila `parentId` null). */
    nextPosition(planId: string, parentId: string | null): number {
      const row = db
        .select({ last: max(features.position) })
        .from(features)
        .where(
          and(
            eq(features.planId, planId),
            parentId === null
              ? isNull(features.parentId)
              : eq(features.parentId, parentId),
          ),
        )
        .get();
      return row?.last === null || row?.last === undefined ? 0 : row.last + 1;
    },

    /** Fase terbesar di antara fitur level atas; null bila belum ada fitur. */
    lastPhase(planId: string): number | null {
      const row = db
        .select({ last: max(features.phase) })
        .from(features)
        .where(and(eq(features.planId, planId), isNull(features.parentId)))
        .get();
      return row?.last ?? null;
    },
  };
}

export type RoadmapRepo = ReturnType<typeof createRoadmapRepo>;

export const getRoadmapRepo = (): RoadmapRepo => createRoadmapRepo(getDb());
