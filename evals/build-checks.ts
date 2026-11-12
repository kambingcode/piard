import type { SpecOutput, TasksOutput } from "@/features/specs/ai/build.schema";
import { TARGET_NEEDS, TARGET_TASKS } from "@/features/specs/ai/build.schema";
import type { Check } from "./roadmap-checks";

/** Prompt task (sudah dirakit) harus berdiri sendiri tapi tidak bertele-tele (doc 07 bagian 8.5). */
export const PROMPT_WORDS = { min: 80, max: 450 } as const;
/** Langkah per task: kurang dari ini terlalu dangkal untuk coding agent. */
export const STEPS = { min: 3, max: 8 } as const;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Pemeriksaan spesifikasi dan task satu fitur: jumlah butir kebutuhan, semua sub-fitur terisi dengan
 * nama yang sama, 3-8 task berjudul ringkas, langkah yang cukup rinci, dan panjang prompt yang sudah
 * dirakit (`prompts`, urutan sama dengan task). Fungsi murni.
 */
export function checkBuild(
  feature: { name: string; subFeatures: string[] },
  spec: SpecOutput,
  tasks: TasksOutput,
  prompts: string[],
): Check[] {
  const needs = spec.feature.needs.length;
  const subNames = spec.subFeatures.map((s) => s.name.trim().toLowerCase());
  const missingSubs = feature.subFeatures.filter(
    (n) => !subNames.includes(n.trim().toLowerCase()),
  );
  const count = tasks.tasks.length;
  const longTitles = tasks.tasks.filter((t) => words(t.title) > 12).map((t) => t.title);
  const promptWords = prompts.map(words);
  const badPrompts = promptWords.filter(
    (n) => n < PROMPT_WORDS.min || n > PROMPT_WORDS.max,
  );
  const stepCounts = tasks.tasks.map((t) => t.steps.length);
  const shallow = stepCounts.filter((n) => n < STEPS.min || n > STEPS.max).length;
  return [
    {
      name: `${TARGET_NEEDS.min}-${TARGET_NEEDS.max} kebutuhan fitur`,
      pass: needs >= TARGET_NEEDS.min && needs <= TARGET_NEEDS.max,
      detail: `${needs}`,
    },
    {
      name: "tujuan satu kalimat",
      pass: words(spec.feature.goal) <= 40,
      detail: `${words(spec.feature.goal)} kata`,
    },
    {
      name: "semua sub-fitur berspesifikasi (nama sama)",
      pass: missingSubs.length === 0,
      detail:
        missingSubs.length === 0
          ? `${feature.subFeatures.length}`
          : `hilang: ${missingSubs.join(", ")}`,
    },
    {
      name: `${TARGET_TASKS.min}-${TARGET_TASKS.max} task`,
      pass: count >= TARGET_TASKS.min && count <= TARGET_TASKS.max,
      detail: `${count}`,
    },
    {
      name: "judul task ≤ 12 kata",
      pass: longTitles.length === 0,
      detail: longTitles.length === 0 ? "-" : longTitles.join(" | "),
    },
    {
      name: `prompt ${PROMPT_WORDS.min}-${PROMPT_WORDS.max} kata`,
      pass: badPrompts.length === 0,
      detail: promptWords.join(","),
    },
    {
      name: `${STEPS.min}-${STEPS.max} langkah per task`,
      pass: shallow === 0,
      detail: stepCounts.join(","),
    },
  ];
}
