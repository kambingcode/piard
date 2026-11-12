import "server-only";

import { gte, sql } from "drizzle-orm";
import type { BudgetLimits } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { usage } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";

export type { BudgetLimits };

export type BudgetPeriod = { spentUsd: number; limitUsd: number | null };
export type BudgetStatus = { daily: BudgetPeriod; monthly: BudgetPeriod };

export type BudgetGuard = {
  /** Biaya yang sudah terpakai hari ini dan bulan ini (zona waktu server) beserta batasnya. */
  status(): BudgetStatus;
  /** @throws {AppError} `BUDGET_EXCEEDED` bila batas harian atau bulanan sudah tercapai. */
  assertAvailable(): void;
};

export type BudgetDeps = {
  db: Db;
  /** Dibaca setiap kali dicek, agar batas yang diubah berlaku tanpa membuat penjaga baru. */
  limits: () => BudgetLimits;
  now?: () => Date;
};

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const usd = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Penjaga batas biaya AI. Batasnya untuk seluruh aplikasi, bukan per pengguna: semua pengguna memakai
 * kunci API yang sama, jadi yang dibatasi adalah tagihan pemilik kunci (doc 07 bagian 9).
 */
export function createBudgetGuard({
  db,
  limits,
  now = () => new Date(),
}: BudgetDeps): BudgetGuard {
  const spentSince = (since: Date): number =>
    db
      .select({ total: sql<number>`coalesce(sum(${usage.costUsd}), 0)` })
      .from(usage)
      .where(gte(usage.createdAt, since))
      .get()?.total ?? 0;

  function status(): BudgetStatus {
    const current = now();
    const { dailyUsd, monthlyUsd } = limits();
    return {
      daily: { spentUsd: spentSince(startOfDay(current)), limitUsd: dailyUsd },
      monthly: { spentUsd: spentSince(startOfMonth(current)), limitUsd: monthlyUsd },
    };
  }

  function assertAvailable(): void {
    const { dailyUsd, monthlyUsd } = limits();
    if (dailyUsd === null && monthlyUsd === null) return;
    const { daily, monthly } = status();
    if (monthly.limitUsd !== null && monthly.spentUsd >= monthly.limitUsd) {
      throw new AppError(
        "BUDGET_EXCEEDED",
        `Batas biaya AI bulanan (${usd.format(monthly.limitUsd)}) sudah tercapai: terpakai ${usd.format(monthly.spentUsd)} bulan ini. Naikkan batas bulanan di halaman Pengaturan, atau tunggu bulan depan.`,
      );
    }
    if (daily.limitUsd !== null && daily.spentUsd >= daily.limitUsd) {
      throw new AppError(
        "BUDGET_EXCEEDED",
        `Batas biaya AI harian (${usd.format(daily.limitUsd)}) sudah tercapai: terpakai ${usd.format(daily.spentUsd)} hari ini. Naikkan batas harian di halaman Pengaturan, atau coba lagi besok.`,
      );
    }
  }

  return { status, assertAvailable };
}
