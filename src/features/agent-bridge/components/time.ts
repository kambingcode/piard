/** Format waktu untuk linimasa dan penanda card (Bahasa Indonesia). */

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );

const relative = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

/** "5 menit yang lalu", "kemarin", … dari `iso` relatif terhadap `now`. */
export function ago(iso: string, now: number): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(Math.min(0, seconds), "second");
  if (abs < 3_600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3_600), "hour");
  return relative.format(Math.round(seconds / 86_400), "day");
}
