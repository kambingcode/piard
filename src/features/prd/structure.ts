import type { PlanLanguage } from "@/features/plans";

/** Tujuh bagian PRD (doc 04): judul per bahasa, nomor menjadi kunci pemeriksaan. */
export const PRD_SECTIONS: Record<PlanLanguage, readonly string[]> = {
  id: [
    "Ringkasan",
    "Kebutuhan",
    "Fitur Inti",
    "Alur Pengguna",
    "Arsitektur",
    "Skema Database",
    "Desain & Batasan Teknis",
  ],
  en: [
    "Overview",
    "Requirements",
    "Core Features",
    "User Flow",
    "Architecture",
    "Database Schema",
    "Design & Technical Constraints",
  ],
};

export const PRD_SECTION_COUNT = 7;

/** Nomor bagian (1..7) yang judulnya `## n. ...` muncul di teks. Dipakai juga untuk progres. */
export function foundSections(content: string): number[] {
  const found = new Set<number>();
  for (const match of content.matchAll(/^##\s+(\d+)\.\s+\S/gm)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= PRD_SECTION_COUNT) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/** Isi blok ```mermaid di teks, berurutan. */
export function mermaidBlocks(content: string): string[] {
  return [...content.matchAll(/^```mermaid[^\n]*\n([\s\S]*?)^```/gm)].map((m) =>
    (m[1] ?? "").trim(),
  );
}

export type PrdStructure = {
  hasTitle: boolean;
  missingSections: number[];
  hasSequenceDiagram: boolean;
  hasErDiagram: boolean;
};

/** Pemeriksaan bentuk PRD (bukan kebenaran sintaks mermaid; itu dicek viewer dan eval). */
export function checkPrdStructure(content: string): PrdStructure {
  const found = new Set(foundSections(content));
  const diagrams = mermaidBlocks(content);
  return {
    hasTitle: /^#\s+\S/m.test(content),
    missingSections: Array.from({ length: PRD_SECTION_COUNT }, (_, i) => i + 1).filter(
      (n) => !found.has(n),
    ),
    hasSequenceDiagram: diagrams.some((d) => /^sequenceDiagram\b/.test(d)),
    hasErDiagram: diagrams.some((d) => /^erDiagram\b/.test(d)),
  };
}

export const isCompletePrd = (s: PrdStructure): boolean =>
  s.hasTitle && s.missingSections.length === 0 && s.hasSequenceDiagram && s.hasErDiagram;

/**
 * Merapikan keluaran model: membuang teks pembuka sebelum judul `# ...` (beberapa model menulis
 * "Berikut PRD-nya:", pembuka ```markdown, atau sisa penalaran lebih dulu), pagar ganda di sekitar
 * blok (Nemotron menulis "```" tepat sebelum "```mermaid" dan sesudah penutupnya), dan pagar
 * penutup yang tersisa tanpa pasangan.
 */
export function cleanPrd(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  // Baris pagar polos yang langsung diikuti baris pagar lain tidak pernah bermakna: buang.
  text = text.replace(/^```[ \t]*\n(?=```)/gm, "");
  const title = /^#\s+\S/m.exec(text);
  if (title && title.index > 0) text = text.slice(title.index);
  const fences = text.match(/^```/gm)?.length ?? 0;
  if (fences % 2 === 1) text = text.replace(/\n```\s*$/, "");
  return `${text.trim()}\n`;
}
