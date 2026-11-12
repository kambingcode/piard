import { strToU8, zipSync } from "fflate";
import { slugify } from "@/lib/slug";

export type ExportTask = { title: string; description: string; prompt: string };
export type ExportSubFeature = { name: string; summary: string; spec: string };
export type ExportFeature = {
  name: string;
  summary: string;
  spec: string;
  subFeatures: ExportSubFeature[];
  tasks: ExportTask[];
};

/** Pagar blok kode yang lebih panjang dari deretan backtick mana pun di dalam teks. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

const block = (...parts: string[]) => parts.filter((p) => p.trim() !== "").join("\n\n");

/**
 * Isi `features/NN-<slug>.md` (doc 04): `# <nama>`, ringkasan, `## Spesifikasi`, lalu tiap sub-fitur
 * `## Sub-fitur: <nama>` + ringkasan + spesifikasi, lalu `## Task` dengan `### n. <judul>`, deskripsi,
 * dan `**Prompt:**` dalam blok kode.
 */
export function featureMarkdown(feature: ExportFeature): string {
  const tasks = feature.tasks.map((task, i) => {
    const fence = fenceFor(task.prompt);
    return block(
      `### ${i + 1}. ${task.title}`,
      task.description,
      `**Prompt:**\n\n${fence}\n${task.prompt.trim()}\n${fence}`,
    );
  });
  return `${block(
    `# ${feature.name}`,
    feature.summary,
    feature.spec.trim() ? `## Spesifikasi\n\n${feature.spec.trim()}` : "## Spesifikasi",
    ...feature.subFeatures.map((sub) =>
      block(`## Sub-fitur: ${sub.name}`, sub.summary, sub.spec.trim()),
    ),
    tasks.length > 0 ? `## Task\n\n${tasks.join("\n\n")}` : "## Task",
  )}\n`;
}

/**
 * Berkas paket ekspor (doc 04): `PRD.md` dan `features/NN-<slug>.md` berurutan sesuai roadmap.
 * Slug yang sama diberi akhiran `-2`, `-3` agar tidak ada berkas yang tertimpa. Fungsi murni.
 */
export function exportFiles(
  prd: string,
  features: ExportFeature[],
): Record<string, string> {
  const files: Record<string, string> = {
    "PRD.md": prd.endsWith("\n") ? prd : `${prd}\n`,
  };
  const used = new Map<string, number>();
  const width = Math.max(2, String(features.length).length);
  features.forEach((feature, index) => {
    const base = slugify(feature.name, "fitur");
    const seen = (used.get(base) ?? 0) + 1;
    used.set(base, seen);
    const slug = seen === 1 ? base : `${base}-${seen}`;
    const number = String(index + 1).padStart(width, "0");
    files[`features/${number}-${slug}.md`] = featureMarkdown(feature);
  });
  return files;
}

/** Mengemas berkas menjadi ZIP (UTF-8, tanggal tetap agar hasilnya deterministik untuk tes). */
export function zipFiles(
  files: Record<string, string>,
  mtime = new Date(2026, 0, 1),
): Uint8Array<ArrayBuffer> {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [path, [strToU8(text), { mtime }]]),
    ),
    { level: 6 },
  );
  // Disalin ke ArrayBuffer biasa agar bisa langsung menjadi isi `Response`.
  return new Uint8Array(zipped);
}
