import type { RoadmapOutput } from "@/features/roadmap/ai/roadmap.schema";
import {
  TARGET_FEATURES,
  TARGET_SUB_FEATURES,
} from "@/features/roadmap/ai/roadmap.schema";

/** Batas waktu kartu M2-06: roadmap `ready` kurang dari 60 detik. */
export const READY_BUDGET_MS = 60_000;

export type Check = { name: string; pass: boolean; detail: string };

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Pemeriksaan struktur roadmap (doc 07 bagian 8.2): 5-8 fitur, fase berurutan mulai 1 tanpa
 * lompatan, 3-5 sub-fitur per fitur, tanpa sub-fitur ganda, nama ringkas. Fungsi murni.
 */
export function checkRoadmap(output: RoadmapOutput, elapsedMs?: number): Check[] {
  const { features } = output;
  const phases = features.map((f) => f.phase);
  const distinct = [...new Set(phases)].sort((a, b) => a - b);
  const subCounts = features.map((f) => f.subFeatures.length);
  const subNames = features.flatMap((f) =>
    f.subFeatures.map((s) => s.name.toLowerCase()),
  );
  const duplicates = subNames.filter((name, i) => subNames.indexOf(name) !== i);
  const longNames = [...features, ...features.flatMap((f) => f.subFeatures)]
    .map((item) => item.name)
    .filter((name) => words(name) > 5);

  const checks: Check[] = [
    {
      name: `${TARGET_FEATURES.min}-${TARGET_FEATURES.max} fitur`,
      pass:
        features.length >= TARGET_FEATURES.min && features.length <= TARGET_FEATURES.max,
      detail: `${features.length} fitur`,
    },
    {
      name: "fase berurutan",
      pass: phases.every((phase, i) => i === 0 || phase >= (phases[i - 1] ?? 0)),
      detail: phases.join(","),
    },
    {
      name: "fase mulai 1 tanpa lompatan",
      pass: distinct.every((phase, i) => phase === i + 1),
      detail: distinct.join(","),
    },
    {
      name: `${TARGET_SUB_FEATURES.min}-${TARGET_SUB_FEATURES.max} sub-fitur per fitur`,
      pass: subCounts.every(
        (n) => n >= TARGET_SUB_FEATURES.min && n <= TARGET_SUB_FEATURES.max,
      ),
      detail: subCounts.join(","),
    },
    {
      name: "tanpa sub-fitur ganda",
      pass: duplicates.length === 0,
      detail: duplicates.length === 0 ? "-" : duplicates.join(", "),
    },
    {
      name: "nama ringkas (≤ 5 kata)",
      pass: longNames.length === 0,
      detail: longNames.length === 0 ? "-" : longNames.join(" | "),
    },
  ];
  if (elapsedMs !== undefined) {
    checks.push({
      name: "ready < 60 detik",
      pass: elapsedMs < READY_BUDGET_MS,
      detail: `${(elapsedMs / 1000).toFixed(1)} dtk`,
    });
  }
  return checks;
}

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Roadmap fitur baru untuk proyek eksisting (M7-19) tidak boleh berisi fitur yang sudah ada: nama fitur
 * tidak sama dengan nama fitur yang ada (huruf besar/kecil dan spasi diabaikan).
 */
export function checkNoExistingFeatures(
  roadmap: { features: { name: string }[] },
  existing: readonly string[],
): Check {
  const known = new Set(existing.map(normalize));
  const repeated = roadmap.features
    .map((f) => f.name)
    .filter((name) => known.has(normalize(name)));
  return {
    name: "tidak mengulang fitur yang sudah ada",
    pass: repeated.length === 0,
    detail: repeated.length === 0 ? "0 fitur lama" : `mengulang: ${repeated.join(", ")}`,
  };
}
