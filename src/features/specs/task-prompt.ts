import type { PlanLanguage } from "@/features/plans";

const TEXT = {
  id: {
    intro: (product: string, feature: string, phase: string) =>
      `Kamu sedang mengerjakan produk "${product}", fitur "${feature}"${phase}.`,
    phase: (n: number) => ` (Fase ${n})`,
    tech: (tech: string) => `Teknologi: ${tech}.`,
    techFallback: "Teknologi: ikuti stack dan pola yang sudah ada di proyek ini.",
    task: "Tugas",
    spec: "Spesifikasi fitur",
    steps: "Langkah",
    done: "Selesai bila",
    closing:
      "Kerjakan hanya tugas ini, ikuti pola kode yang sudah ada, dan jelaskan singkat apa yang berubah.",
  },
  en: {
    intro: (product: string, feature: string, phase: string) =>
      `You are working on the product "${product}", feature "${feature}"${phase}.`,
    phase: (n: number) => ` (Phase ${n})`,
    tech: (tech: string) => `Tech stack: ${tech}.`,
    techFallback: "Tech stack: follow the stack and patterns already in this project.",
    task: "Task",
    spec: "Feature spec",
    steps: "Steps",
    done: "Done when",
    closing:
      "Do only this task, follow the existing code patterns, and briefly explain what changed.",
  },
} as const;

export type TaskPromptContext = {
  language: PlanLanguage;
  product: string;
  feature: string;
  phase: number | null;
  /** Teknologi pilihan pengguna (`area: nilai`); kosong berarti ikuti proyek. */
  tech: string[];
  /** Spesifikasi fitur (Markdown `### Tujuan` ...). */
  spec: string;
};

const clean = (line: string) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();

/**
 * Prompt siap tempel untuk AI coding agent (doc 07 bagian 8.5), dirakit dari konteks plan dan isian
 * task dari model. Berdiri sendiri: agent tidak perlu membaca PRD.
 */
export function renderTaskPrompt(
  context: TaskPromptContext,
  task: { title: string; description: string; steps: string[]; done: string[] },
): string {
  const t = TEXT[context.language];
  const phase = context.phase ? t.phase(context.phase) : "";
  const spec = context.spec.trim().replace(/^###\s+/gm, "");
  return [
    t.intro(context.product, context.feature, phase),
    context.tech.length > 0 ? t.tech(context.tech.join("; ")) : t.techFallback,
    "",
    `${t.task}: ${task.title.trim()}`,
    task.description.trim(),
    "",
    `${t.spec}:`,
    spec,
    "",
    `${t.steps}:`,
    ...task.steps.map((step, i) => `${i + 1}. ${clean(step)}`),
    "",
    `${t.done}:`,
    ...task.done.map((item) => `- ${clean(item)}`),
    "",
    t.closing,
  ].join("\n");
}
