export const DAY_GROUPS = ["today", "yesterday", "week", "month", "older"] as const;
export type DayGroup = (typeof DAY_GROUPS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Kelompok hari untuk satu tanggal, dihitung per hari kalender di zona waktu proses. */
export function dayGroupOf(date: Date, now: Date): DayGroup {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / MS_PER_DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < WEEK_DAYS) return "week";
  if (days < MONTH_DAYS) return "month";
  return "older";
}

/**
 * Mengelompokkan item per hari (hari ini, kemarin, 7 hari terakhir, …) dengan urutan tetap dan
 * tanpa kelompok kosong. Urutan item di dalam kelompok dipertahankan.
 */
export function groupByDay<T>(
  items: T[],
  getDate: (item: T) => Date,
  now: Date = new Date(),
): Array<{ group: DayGroup; items: T[] }> {
  const buckets = new Map<DayGroup, T[]>();
  for (const item of items) {
    const group = dayGroupOf(getDate(item), now);
    buckets.set(group, [...(buckets.get(group) ?? []), item]);
  }
  return DAY_GROUPS.flatMap((group) => {
    const groupItems = buckets.get(group);
    return groupItems ? [{ group, items: groupItems }] : [];
  });
}
