import { z } from "zod";
import type { FeatureChange } from "@/features/roadmap";

/**
 * Bentuk perubahan yang ditulis model: satu objek datar (bukan union) karena model kecil/gratis
 * lebih andal mengisinya. Aturan per jenis diperiksa {@link normalizeChanges}.
 */
export const rawChangeSchema = z.object({
  op: z.enum(["add", "update", "remove"]).describe("Jenis perubahan"),
  featureId: z
    .string()
    .optional()
    .describe("Wajib untuk update/remove: id fitur dari daftar fitur"),
  name: z
    .string()
    .optional()
    .describe("Nama fitur (wajib untuk add; untuk update bila diganti)"),
  summary: z
    .string()
    .optional()
    .describe("Ringkasan 1 kalimat (add; update bila diganti)"),
  phase: z.number().int().optional().describe("Fase 1-10 (opsional)"),
  subFeatures: z
    .array(z.object({ name: z.string(), summary: z.string() }))
    .optional()
    .describe("Hanya untuk add: 2-4 sub-fitur"),
});
export type RawChange = z.infer<typeof rawChangeSchema>;

export const rawChangesSchema = z.object({ changes: z.array(rawChangeSchema) });

/** Fitur level atas yang boleh disentuh perubahan (keadaan saat usulan dibuat). */
export type ChangeTarget = {
  id: string;
  name: string;
  summary: string;
  phase: number | null;
};

const clean = (text: string | undefined) => text?.replace(/\s+/g, " ").trim() ?? "";

/**
 * Mengubah keluaran model menjadi perubahan yang sah: `add` tanpa nama, `update`/`remove` dengan id
 * yang tidak dikenal, `update` yang tidak mengubah apa pun, dan perubahan ganda pada fitur yang sama
 * dibuang. `update`/`remove` diberi salinan keadaan sebelumnya untuk ditampilkan.
 */
export function normalizeChanges(
  raw: RawChange[],
  targets: ChangeTarget[],
): FeatureChange[] {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const touched = new Set<string>();
  const out: FeatureChange[] = [];
  for (const change of raw) {
    if (change.op === "add") {
      const name = clean(change.name);
      if (!name) continue;
      out.push({
        op: "add",
        name,
        summary: clean(change.summary),
        phase: change.phase ?? null,
        subFeatures: (change.subFeatures ?? [])
          .map((s) => ({ name: clean(s.name), summary: clean(s.summary) }))
          .filter((s) => s.name !== ""),
      });
      continue;
    }
    const target = change.featureId ? byId.get(change.featureId.trim()) : undefined;
    if (!target || touched.has(target.id)) continue;
    if (change.op === "remove") {
      touched.add(target.id);
      out.push({ op: "remove", featureId: target.id, name: target.name });
      continue;
    }
    const name = clean(change.name);
    const summary = clean(change.summary);
    const update: FeatureChange = {
      op: "update",
      featureId: target.id,
      before: { name: target.name, summary: target.summary, phase: target.phase },
    };
    if (name && name !== target.name) update.name = name;
    if (summary && summary !== target.summary) update.summary = summary;
    if (change.phase !== undefined && change.phase !== target.phase)
      update.phase = change.phase;
    if (
      update.name === undefined &&
      update.summary === undefined &&
      update.phase === undefined
    )
      continue;
    touched.add(target.id);
    out.push(update);
  }
  return out;
}
