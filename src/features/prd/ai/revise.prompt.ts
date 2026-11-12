import type { Plan } from "@/features/plans";
import { type PrdPromptFeature, prdFormatRules, roadmapOutline } from "./prd.prompt";

export type RevisePromptInput = Pick<Plan, "language"> & {
  title: string;
  /** PRD versi terbaru yang direvisi. */
  current: string;
  /** Perubahan yang diminta (ditulis model chat atau pengguna). */
  instructions: string;
  features: PrdPromptFeature[];
};

/**
 * Prompt revisi PRD (R13): model menulis ulang PRD utuh dengan perubahan yang diminta. Keluaran
 * utuh (bukan diff) agar bisa dialirkan, dicek strukturnya, dan disimpan sebagai versi baru.
 */
export function buildRevisePrompt(input: RevisePromptInput): {
  system: string;
  prompt: string;
} {
  const system = [
    "Kamu product manager senior yang merevisi PRD sesuai permintaan pengguna.",
    ...prdFormatRules(input.language),
    "",
    "Aturan revisi:",
    "- Tulis ulang PRD utuh dari baris pertama sampai bagian 7, bukan hanya bagian yang berubah.",
    "- Terapkan hanya perubahan yang diminta. Bagian lain disalin apa adanya, kata per kata.",
    "- Bila perubahan menyentuh fitur, sesuaikan juga alur pengguna, diagram, dan skema database seperlunya.",
    "- Jangan menambah catatan tentang revisi di dalam dokumen.",
  ].join("\n");

  const prompt = [
    `Nama produk: ${input.title}`,
    `\n\nPerubahan yang diminta:\n${input.instructions.trim()}`,
    `\n\nFitur di roadmap saat ini:\n${roadmapOutline(input.features)}`,
    `\n\nPRD saat ini:\n\n${input.current.trim()}`,
  ]
    .join("")
    .trim();

  return { system, prompt };
}
