/** Ringkasan token dan biaya; dipakai untuk satu run maupun total plan. */
export type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** Satu run AI: satu job (bisa beberapa panggilan model) atau satu panggilan di luar job. */
export type UsageRun = UsageTotals & {
  id: string;
  /** Tugas AI (`questions`, `roadmap`, `prd`, `spec`, `tasks`, `chat`). */
  kinds: string[];
  models: string[];
  startedAt: Date;
};

export type BudgetPeriodView = { spentUsd: number; limitUsd: number | null };

export type PlanUsage = {
  runs: UsageRun[];
  /** Total seluruh run plan, termasuk yang tidak tampil karena batas daftar. */
  totals: UsageTotals;
  budget: { daily: BudgetPeriodView; monthly: BudgetPeriodView };
};

/** Run yang ditampilkan per plan; yang lebih lama tetap terhitung di total. */
export const MAX_RUNS = 100;
