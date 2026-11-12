import type { PlanLanguage } from "@/features/plans";

const HEADINGS: Record<PlanLanguage, { goal: string; needs: string }> = {
  id: { goal: "Tujuan", needs: "Yang dibutuhkan" },
  en: { goal: "Goal", needs: "Requirements" },
};

/**
 * Spesifikasi sebagai Markdown (doc 04): `### Tujuan` satu kalimat lalu `### Yang dibutuhkan` berupa
 * bullet. Dirakit dari keluaran terstruktur sehingga formatnya selalu sama apa pun modelnya.
 */
export function renderSpec(
  language: PlanLanguage,
  spec: { goal: string; needs: string[] },
): string {
  const h = HEADINGS[language];
  const needs = spec.needs
    .map((n) => `- ${n.replace(/^[-*•]\s*/, "").trim()}`)
    .join("\n");
  return `### ${h.goal}\n${spec.goal.trim()}\n\n### ${h.needs}\n${needs}\n`;
}
