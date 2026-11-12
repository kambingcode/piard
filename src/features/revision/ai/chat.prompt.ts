import { type Plan, PROMPT_LANGUAGE } from "@/features/plans";
import type { ChangeTarget } from "./changes.schema";

export type ChatPromptInput = Pick<Plan, "language"> & {
  title: string;
  prd: string;
  prdVersion: number;
  features: (ChangeTarget & { subFeatures: string[] })[];
};

/** Nama tool yang dilihat model (situs acuan memakai nama yang sama). */
export const TOOL_UPDATE_PRD = "updatePrd";
export const TOOL_PROPOSE_CHANGES = "proposeFeatureChanges";

function featureList(features: ChatPromptInput["features"]): string {
  if (features.length === 0) return "(belum ada fitur)";
  return features
    .map((f) => {
      const phase = f.phase ? `, fase ${f.phase}` : "";
      const subs =
        f.subFeatures.length > 0 ? ` Sub-fitur: ${f.subFeatures.join("; ")}.` : "";
      return `- [id: ${f.id}${phase}] ${f.name}: ${f.summary}${subs}`;
    })
    .join("\n");
}

/**
 * Prompt sistem chat revisi (R13). PRD dan fitur ikut di prompt sistem (bukan riwayat) agar model
 * selalu melihat versi terbaru, walau percakapan dimulai sebelum revisi terakhir.
 */
export function buildChatSystem(input: ChatPromptInput): string {
  return [
    `Kamu asisten product manager untuk produk "${input.title}". Pengguna sedang membaca PRD-nya.`,
    `Jawab dalam ${PROMPT_LANGUAGE[input.language]}, singkat (paling banyak sekitar 120 kata), tanpa menyalin PRD.`,
    "",
    "Kamu punya dua tool:",
    `- ${TOOL_UPDATE_PRD}: pakai bila pengguna meminta PRD diubah (menambah, menghapus, atau menulis ulang isi). Isi "instructions" dengan perubahan yang lengkap dan spesifik, dan "summary" dengan ringkasan 1 kalimat untuk pengguna. Tool ini memulai revisi; PRD baru muncul beberapa saat kemudian.`,
    `- ${TOOL_PROPOSE_CHANGES}: pakai bila perubahan menyangkut daftar fitur di roadmap (fitur baru, fitur dihapus, nama/ringkasan/fase fitur berubah). Untuk update/remove pakai id dari daftar fitur di bawah. Pengguna akan menerima atau menolak usulan ini.`,
    "Bila permintaan menambah atau menghapus fitur, panggil KEDUA tool: PRD diubah dan roadmap diusulkan berubah.",
    "Untuk pertanyaan, saran, atau penjelasan, cukup jawab tanpa tool. Jangan memanggil tool bila pengguna belum meminta perubahan.",
    "Sebelum memanggil tool, tulis 1-2 kalimat tentang apa yang akan kamu ubah.",
    "",
    `Fitur di roadmap saat ini:\n${featureList(input.features)}`,
    "",
    `PRD saat ini (versi ${input.prdVersion}):\n\n${input.prd.trim()}`,
  ].join("\n");
}

/** Prompt "Sesuaikan fitur dengan PRD": membandingkan bagian Fitur Inti PRD dengan roadmap. */
export function buildReconcilePrompt(input: Omit<ChatPromptInput, "prdVersion">): {
  system: string;
  prompt: string;
} {
  const system = [
    "Kamu membandingkan PRD dengan daftar fitur roadmap dan mengusulkan perubahan roadmap agar sesuai dengan PRD.",
    "Tulis nama dan ringkasan fitur dalam bahasa yang sama dengan PRD.",
    "Aturan:",
    "- add: fitur yang dibahas PRD (terutama bagian Fitur Inti) tetapi tidak ada di roadmap. Sertakan 2-4 sub-fitur.",
    "- remove: fitur roadmap yang sudah tidak disebut di PRD sama sekali.",
    "- update: fitur yang ada di keduanya tetapi nama atau ringkasannya jelas berbeda. Pakai id dari daftar.",
    "- Bila roadmap sudah sesuai, kembalikan changes kosong. Jangan mengusulkan perubahan kecil soal gaya bahasa.",
  ].join("\n");
  const prompt = [
    `Produk: ${input.title}`,
    `\n\nFitur di roadmap:\n${featureList(input.features)}`,
    `\n\nPRD:\n\n${input.prd.trim()}`,
  ]
    .join("")
    .trim();
  return { system, prompt };
}
