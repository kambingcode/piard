import "server-only";

import { and, desc, eq, max } from "drizzle-orm";
import { type Db, getDb } from "@/server/db/client";
import { documents } from "@/server/db/schema";
import { PRD_TITLE } from "../schemas";

export type DocumentRow = typeof documents.$inferSelect;

/** Satu-satunya tempat di fitur PRD yang tahu tabel `documents`. */
export function createPrdRepo(db: Db) {
  const ofPlan = (planId: string) =>
    and(eq(documents.planId, planId), eq(documents.title, PRD_TITLE));

  return {
    latest(planId: string): DocumentRow | undefined {
      return db
        .select()
        .from(documents)
        .where(ofPlan(planId))
        .orderBy(desc(documents.version))
        .limit(1)
        .get();
    },

    /** Semua versi, terbaru dulu. */
    list(planId: string): DocumentRow[] {
      return db
        .select()
        .from(documents)
        .where(ofPlan(planId))
        .orderBy(desc(documents.version))
        .all();
    },

    findVersion(planId: string, version: number): DocumentRow | undefined {
      return db
        .select()
        .from(documents)
        .where(and(ofPlan(planId), eq(documents.version, version)))
        .get();
    },

    /**
     * Menyimpan isi sebagai versi berikutnya (1 bila belum ada). Nomor dihitung di transaksi yang
     * sama dengan penyisipan; indeks unik (plan, judul, versi) menolak tabrakan.
     */
    insertNextVersion(planId: string, content: string): DocumentRow {
      return db.transaction((tx) => {
        const current = tx
          .select({ version: max(documents.version) })
          .from(documents)
          .where(ofPlan(planId))
          .get();
        return tx
          .insert(documents)
          .values({
            planId,
            title: PRD_TITLE,
            content,
            version: (current?.version ?? 0) + 1,
          })
          .returning()
          .get();
      });
    },
  };
}

export type PrdRepo = ReturnType<typeof createPrdRepo>;

/** Repo untuk database proses ini. */
export const getPrdRepo = (): PrdRepo => createPrdRepo(getDb());
