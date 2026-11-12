import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import type { JobPayload, JobProgress } from "@/server/db/json-types";
import { jobs } from "@/server/db/schema";
import type { JobRecord, JobState } from "./types";

/** Satu-satunya tempat yang tahu tabel `jobs`. */
export function createJobRepo(db: Db) {
  const byId = (id: string) => db.select().from(jobs).where(eq(jobs.id, id)).get();

  return {
    insert(input: {
      kind: string;
      planId: string | null;
      payload: JobPayload;
    }): JobRecord {
      return db.insert(jobs).values(input).returning().get();
    },

    get: byId,

    /** Job `queued`/`running` dengan jenis dan plan sama; pemanggil membandingkan muatannya. */
    findActive(kind: string, planId: string | null): JobRecord[] {
      return db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.kind, kind),
            planId === null ? sql`${jobs.planId} is null` : eq(jobs.planId, planId),
            inArray(jobs.state, ["queued", "running"]),
          ),
        )
        .all();
    },

    latestFor(planId: string, kind?: string): JobRecord | undefined {
      return db
        .select()
        .from(jobs)
        .where(and(eq(jobs.planId, planId), kind ? eq(jobs.kind, kind) : undefined))
        .orderBy(desc(jobs.createdAt), desc(sql`rowid`))
        .limit(1)
        .get();
    },

    /** Mengambil job antre tertua dan menandainya `running` dalam satu transaksi. */
    claimNext(): JobRecord | undefined {
      return db.transaction((tx) => {
        const next = tx
          .select()
          .from(jobs)
          .where(eq(jobs.state, "queued"))
          .orderBy(asc(jobs.createdAt), asc(sql`rowid`))
          .limit(1)
          .get();
        if (!next) return undefined;
        return tx
          .update(jobs)
          .set({ state: "running", attempts: next.attempts + 1, error: null })
          .where(eq(jobs.id, next.id))
          .returning()
          .get();
      });
    },

    updateProgress(id: string, progress: JobProgress): JobRecord | undefined {
      return db.update(jobs).set({ progress }).where(eq(jobs.id, id)).returning().get();
    },

    setState(
      id: string,
      state: JobState,
      error: string | null = null,
    ): JobRecord | undefined {
      return db
        .update(jobs)
        .set({ state, error })
        .where(eq(jobs.id, id))
        .returning()
        .get();
    },

    /** Mengubah state hanya bila state saat ini salah satu dari `from`. */
    transition(id: string, from: JobState[], to: JobState): JobRecord | undefined {
      return db
        .update(jobs)
        .set({ state: to, error: null })
        .where(and(eq(jobs.id, id), inArray(jobs.state, from)))
        .returning()
        .get();
    },

    /** Job `queued`/`running` milik plan, apa pun jenisnya. */
    listActiveForPlan(planId: string): JobRecord[] {
      return db
        .select()
        .from(jobs)
        .where(and(eq(jobs.planId, planId), inArray(jobs.state, ["queued", "running"])))
        .all();
    },

    listByState(state: JobState): JobRecord[] {
      return db.select().from(jobs).where(eq(jobs.state, state)).all();
    },
  };
}

export type JobRepo = ReturnType<typeof createJobRepo>;
