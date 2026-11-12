import { plansCopy } from "./copy";
import { MAX_STEP, MIN_STEP } from "./schemas";

/** Nomor langkah wizard: 1 ide, 2 teknologi, 3 pertanyaan, 4 struktur. */
export const WIZARD_STEPS = Array.from(
  { length: MAX_STEP - MIN_STEP + 1 },
  (_, i) => i + MIN_STEP,
);

export const stepName = (step: number): string =>
  plansCopy.wizard.steps[step - MIN_STEP] ?? "";

/**
 * Langkah yang boleh dibuka: antara 1 dan langkah terjauh yang sudah dicapai plan.
 * Permintaan di luar rentang (atau bukan angka) jatuh ke langkah terjauh, yaitu tempat melanjutkan.
 */
export function resolveStep(requested: string | undefined, furthest: number): number {
  const wanted = Number(requested);
  if (!Number.isInteger(wanted) || wanted < MIN_STEP || wanted > furthest)
    return furthest;
  return wanted;
}
