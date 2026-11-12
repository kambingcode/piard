/** Titik pengamatan pertama progres: kapan dan berapa yang sudah selesai saat itu. */
export type ProgressMark = { at: number; done: number };

const MINUTE_MS = 60_000;

/**
 * Perkiraan sisa waktu (ms) dari laju sejak `start`: waktu per langkah yang selesai sesudah pengamatan
 * pertama dikali langkah yang tersisa. `null` bila belum ada langkah yang selesai sejak `start` (laju belum
 * diketahui) atau semua sudah selesai. Laju sudah memperhitungkan pekerjaan paralel.
 */
export function estimateRemainingMs(
  start: ProgressMark,
  now: number,
  done: number,
  total: number,
): number | null {
  const progressed = done - start.done;
  if (progressed <= 0 || done >= total) return null;
  return ((now - start.at) / progressed) * (total - done);
}

/** Menit bulat ke atas, minimal 1, untuk teks "±n menit lagi". */
export function remainingMinutes(ms: number): number {
  return Math.max(1, Math.ceil(ms / MINUTE_MS));
}
