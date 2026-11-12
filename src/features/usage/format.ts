import { usageCopy } from "./copy";

const usdFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Biaya per panggilan sering di bawah satu sen; tampilkan empat desimal agar tidak terbaca nol. */
const smallUsdFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const SMALL_USD = 0.01;

const TASK_LABELS: Readonly<Record<string, string>> = usageCopy.tasks;

const countFormat = new Intl.NumberFormat("id-ID");

export const timeFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Biaya dalam USD seperti tagihan penyedia. Nol dicetak sebagai nol. */
export function formatUsd(value: number): string {
  return value > 0 && value < SMALL_USD
    ? smallUsdFormat.format(value)
    : usdFormat.format(value);
}

export function formatCount(value: number): string {
  return countFormat.format(value);
}

/** Label tugas AI; gabungan seperti `spec,tasks` (satu job build) menjadi "Spesifikasi + Task". */
export function taskLabel(kinds: string[]): string {
  return kinds.map((kind) => TASK_LABELS[kind] ?? kind).join(" + ");
}

/** Bagian batas yang terpakai, dibatasi 0..1; `null` bila tanpa batas. */
export function budgetRatio(spentUsd: number, limitUsd: number | null): number | null {
  if (limitUsd === null) return null;
  if (limitUsd <= 0) return 1;
  return Math.min(1, Math.max(0, spentUsd / limitUsd));
}
