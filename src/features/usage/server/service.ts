import "server-only";

import type { BudgetStatus } from "@/server/ai";
import { MAX_RUNS, type PlanUsage, type UsageTotals } from "../schemas";
import type { RunRow, UsageRepo } from "./repo";

type Deps = { repo: UsageRepo; budget: () => BudgetStatus };

const splitList = (value: string | null): string[] => (value ? value.split(",") : []);

/** Pemakaian AI per plan (doc 07 bagian 9): token dan biaya tiap run, total, dan batas biaya. */
export function createUsageService({ repo, budget }: Deps) {
  const toRun = (row: RunRow) => ({
    id: row.runId,
    kinds: splitList(row.kinds),
    models: splitList(row.models),
    calls: row.calls,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costUsd: row.costUsd,
    startedAt: new Date(row.startedAt),
  });

  return {
    /** Kepemilikan plan diperiksa di query: plan orang lain menghasilkan daftar kosong. */
    getPlanUsage(userId: string, planId: string): PlanUsage {
      return {
        runs: repo.listRuns(userId, planId, MAX_RUNS).map(toRun),
        totals: repo.totals(userId, planId),
        budget: budget(),
      };
    },

    /** Token dan biaya satu run (mis. job analisis proyek eksisting, yang tidak terikat plan). */
    getRunUsage(userId: string, refId: string): UsageTotals {
      return repo.runTotals(userId, refId);
    },
  };
}

export type UsageService = ReturnType<typeof createUsageService>;
