import { resolveIcon } from "../icons";
import { NAME_MAX_LENGTH, SUMMARY_MAX_LENGTH } from "../schemas";
import { type FeatureOutput, featureOutputSchema } from "./roadmap.schema";

/** Fitur siap simpan: teks dirapikan, ikon dikenal. */
export type NormalizedFeature = {
  name: string;
  summary: string;
  icon: string;
  phase: number;
  subFeatures: { name: string; summary: string; icon: string }[];
};

/** Memotong teks rapi di batas karakter (dengan elipsis) dan membuang spasi berlebih. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Merapikan satu fitur keluaran AI; `phase` dipakai apa adanya (dinormalkan di {@link normalizeRoadmap}). */
export function normalizeFeature(feature: FeatureOutput): NormalizedFeature {
  const name = clip(feature.name, NAME_MAX_LENGTH);
  return {
    name,
    summary: clip(feature.summary, SUMMARY_MAX_LENGTH),
    icon: resolveIcon(feature.icon, name),
    phase: feature.phase,
    subFeatures: feature.subFeatures.map((sub) => {
      const subName = clip(sub.name, NAME_MAX_LENGTH);
      return {
        name: subName,
        summary: clip(sub.summary, SUMMARY_MAX_LENGTH),
        icon: resolveIcon(sub.icon, subName),
      };
    }),
  };
}

/**
 * Fitur yang sudah pasti lengkap pada objek parsial: semua kecuali yang terakhir (yang mungkin
 * masih ditulis). Berhenti di fitur pertama yang belum lolos skema agar posisi tetap berurutan.
 */
export function completedFeatures(partial: unknown): FeatureOutput[] {
  if (typeof partial !== "object" || partial === null || !("features" in partial))
    return [];
  const { features } = partial;
  if (!Array.isArray(features)) return [];
  const done: FeatureOutput[] = [];
  for (const item of features.slice(0, -1)) {
    const parsed = featureOutputSchema.safeParse(item);
    if (!parsed.success) break;
    done.push(parsed.data);
  }
  return done;
}

/**
 * Urutan akhir roadmap: fase dipadatkan menjadi 1..n tanpa lompatan (mis. 1,3,7 → 1,2,3) dan
 * fitur diurutkan stabil menurut fase. `order[k]` = indeks asli fitur yang berada di posisi k.
 */
export function finalOrder(phases: number[]): { order: number[]; phases: number[] } {
  const distinct = [...new Set(phases)].sort((a, b) => a - b);
  const dense = phases.map((phase) => distinct.indexOf(phase) + 1);
  const order = dense
    .map((phase, index) => ({ phase, index }))
    .sort((a, b) => a.phase - b.phase || a.index - b.index)
    .map(({ index }) => index);
  return { order, phases: dense };
}
