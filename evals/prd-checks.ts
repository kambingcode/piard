import {
  checkPrdStructure,
  mermaidBlocks,
  PRD_SECTION_COUNT,
} from "@/features/prd/structure";
import { parseMermaid } from "./mermaid-node";
import type { Check } from "./roadmap-checks";

/** Target kartu M3: PRD ringkas (doc 07 bagian 8.3); di luar rentang ini biasanya bertele-tele atau dangkal. */
export const PRD_WORDS = { min: 400, max: 1800 } as const;
/** Model gratis lambat (±100 detik untuk roadmap); di atas ini pengalaman menunggu terlalu buruk. */
export const PRD_BUDGET_MS = 180_000;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Galat parse mermaid per diagram (kosong bila semua valid). */
export async function invalidDiagrams(content: string): Promise<string[]> {
  const problems: string[] = [];
  for (const [i, block] of mermaidBlocks(content).entries()) {
    try {
      await parseMermaid(block);
    } catch (error) {
      const first = String(error).split("\n").slice(0, 2).join(" ");
      problems.push(`diagram ${i + 1}: ${first.slice(0, 160)}`);
    }
  }
  return problems;
}

/**
 * Pemeriksaan PRD (kartu M3-05): judul, 7 bagian berurutan, kedua diagram ada dan valid secara
 * sintaks mermaid, semua fitur roadmap disebut, panjang wajar, dan waktu tunggu.
 */
export async function checkPrd(
  content: string,
  featureNames: string[],
  elapsedMs?: number,
): Promise<Check[]> {
  const structure = checkPrdStructure(content);
  const order = [...content.matchAll(/^##\s+(\d+)\./gm)].map((m) => Number(m[1]));
  const inOrder = order.every((n, i) => i === 0 || n > (order[i - 1] ?? 0));
  const invalid = await invalidDiagrams(content);
  const lower = content.toLowerCase();
  const missingFeatures = featureNames.filter(
    (name) => !lower.includes(name.toLowerCase()),
  );
  const count = words(content);
  const fences = content.match(/^```/gm)?.length ?? 0;
  const emptyBlocks = content.match(/^```[^\n]*\n```[ \t]*$/gm)?.length ?? 0;

  const checks: Check[] = [
    {
      name: "judul # PRD",
      pass: structure.hasTitle,
      detail: structure.hasTitle ? "ada" : "tidak ada",
    },
    {
      name: `${PRD_SECTION_COUNT} bagian berurutan`,
      pass: structure.missingSections.length === 0 && inOrder,
      detail: `urutan ${order.join(",")}${structure.missingSections.length ? `; kurang ${structure.missingSections.join(",")}` : ""}`,
    },
    {
      name: "sequenceDiagram dan erDiagram",
      pass: structure.hasSequenceDiagram && structure.hasErDiagram,
      detail: `sequence ${structure.hasSequenceDiagram ? "ada" : "tidak ada"}, er ${structure.hasErDiagram ? "ada" : "tidak ada"}`,
    },
    {
      name: "diagram valid (mermaid.parse)",
      pass: invalid.length === 0,
      detail:
        invalid.length === 0
          ? `${mermaidBlocks(content).length} diagram`
          : invalid.join(" | "),
    },
    {
      name: "pagar kode berpasangan, tanpa blok kosong",
      pass: fences % 2 === 0 && emptyBlocks === 0,
      detail: `${fences} pagar, ${emptyBlocks} blok kosong`,
    },
    {
      name: "semua fitur roadmap disebut",
      pass: missingFeatures.length === 0,
      detail:
        missingFeatures.length === 0
          ? `${featureNames.length} fitur`
          : `hilang: ${missingFeatures.join(", ")}`,
    },
    {
      name: `${PRD_WORDS.min}-${PRD_WORDS.max} kata`,
      pass: count >= PRD_WORDS.min && count <= PRD_WORDS.max,
      detail: `${count} kata`,
    },
  ];
  if (elapsedMs !== undefined) {
    checks.push({
      name: `selesai < ${PRD_BUDGET_MS / 1000} detik`,
      pass: elapsedMs < PRD_BUDGET_MS,
      detail: `${(elapsedMs / 1000).toFixed(1)} dtk`,
    });
  }
  return checks;
}
