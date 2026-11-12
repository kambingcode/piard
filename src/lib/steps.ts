export const STEP_STATUSES = ["pending", "running", "done", "failed"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export type Step = {
  id: string;
  label: string;
  status: StepStatus;
  /** Keterangan singkat di sisi kanan, mis. "3/7 fitur". */
  detail?: string;
};

export type StepSummary = {
  done: number;
  total: number;
  /** Langkah yang sedang berjalan atau gagal; undefined bila semua selesai atau belum mulai. */
  current: Step | undefined;
  /** Langkah selesai berurutan dari awal yang boleh dilipat. */
  collapsible: Step[];
  /** Sisanya, mulai dari langkah pertama yang belum selesai. */
  visible: Step[];
};

/**
 * Merangkum daftar langkah untuk tampilan progres (doc 08 bagian 6): langkah yang sudah
 * selesai di awal dilipat, sisanya tetap terlihat. Bila semuanya selesai tidak ada yang dilipat,
 * agar hasil akhir tetap bisa dibaca.
 */
export function summarizeSteps(steps: Step[]): StepSummary {
  const done = steps.filter((s) => s.status === "done").length;
  const firstOpen = steps.findIndex((s) => s.status !== "done");
  const allDone = firstOpen === -1;
  const collapsible = allDone ? [] : steps.slice(0, firstOpen);
  const visible = allDone ? steps : steps.slice(firstOpen);
  const current = steps.find((s) => s.status === "running" || s.status === "failed");
  return { done, total: steps.length, current, collapsible, visible };
}
