import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { type Db, getDb } from "@/server/db/client";
import { plans, usage } from "@/server/db/schema";

export type RunRow = {
  runId: string;
  kinds: string;
  models: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAt: number;
};

export type TotalsRow = Pick<
  RunRow,
  "calls" | "inputTokens" | "outputTokens" | "costUsd"
>;

/**
 * Panggilan satu job berbagi `ref_id` (= id job), jadi dikelompokkan menjadi satu run. Panggilan
 * tanpa job (pertanyaan wizard, chat) masing-masing menjadi run sendiri.
 */
const runId = sql<string>`coalesce(${usage.refId}, ${usage.id})`;

/** Satu-satunya tempat di fitur usage yang tahu tabel `usage`. Hanya baca: penulisnya `server/ai`. */
export function createUsageRepo(db: Db) {
  const ownedPlan = (userId: string, planId: string) =>
    and(eq(usage.planId, planId), eq(plans.userId, userId));

  return {
    /** Run terbaru lebih dulu. */
    listRuns(userId: string, planId: string, limit: number): RunRow[] {
      return db
        .select({
          runId,
          kinds: sql<string>`group_concat(distinct ${usage.kind})`,
          models: sql<string>`group_concat(distinct ${usage.model})`,
          calls: sql<number>`count(*)`,
          inputTokens: sql<number>`sum(${usage.inputTokens})`,
          outputTokens: sql<number>`sum(${usage.outputTokens})`,
          costUsd: sql<number>`sum(${usage.costUsd})`,
          startedAt: sql<number>`min(${usage.createdAt})`,
        })
        .from(usage)
        .innerJoin(plans, eq(plans.id, usage.planId))
        .where(ownedPlan(userId, planId))
        .groupBy(runId)
        .orderBy(desc(sql`min(${usage.createdAt})`))
        .limit(limit)
        .all();
    },

    /** Total satu run (`ref_id` = id job) milik pengguna; run tanpa plan pun terhitung (mis. analisis codebase). */
    runTotals(userId: string, refId: string): TotalsRow {
      return (
        db
          .select({
            calls: sql<number>`count(*)`,
            inputTokens: sql<number>`coalesce(sum(${usage.inputTokens}), 0)`,
            outputTokens: sql<number>`coalesce(sum(${usage.outputTokens}), 0)`,
            costUsd: sql<number>`coalesce(sum(${usage.costUsd}), 0)`,
          })
          .from(usage)
          .where(and(eq(usage.refId, refId), eq(usage.userId, userId)))
          .get() ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
      );
    },

    totals(userId: string, planId: string): TotalsRow {
      return (
        db
          .select({
            calls: sql<number>`count(*)`,
            inputTokens: sql<number>`coalesce(sum(${usage.inputTokens}), 0)`,
            outputTokens: sql<number>`coalesce(sum(${usage.outputTokens}), 0)`,
            costUsd: sql<number>`coalesce(sum(${usage.costUsd}), 0)`,
          })
          .from(usage)
          .innerJoin(plans, eq(plans.id, usage.planId))
          .where(ownedPlan(userId, planId))
          .get() ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
      );
    },
  };
}

export type UsageRepo = ReturnType<typeof createUsageRepo>;

export const getUsageRepo = (): UsageRepo => createUsageRepo(getDb());
