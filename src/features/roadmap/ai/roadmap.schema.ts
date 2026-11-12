import { z } from "zod";

/**
 * Target yang diminta di prompt dan diperiksa `evals/` (doc 07 bagian 8.2): 5-8 fitur,
 * 3-5 sub-fitur per fitur. Skema keluaran sengaja lebih longgar agar satu fitur kelebihan
 * tidak membuang seluruh hasil yang sudah dibayar; nama dan ringkasan dipotong saat disimpan.
 */
export const TARGET_FEATURES = { min: 5, max: 8 } as const;
export const TARGET_SUB_FEATURES = { min: 3, max: 5 } as const;
export const MAX_PHASES = 5;

const textField = z.string().min(1).max(400);

export const subFeatureOutputSchema = z.object({
  name: textField,
  summary: z.string().max(600),
  icon: z.string().max(40),
});

/**
 * Sub-fitur ditulis bersarang di dalam fiturnya (bukan daftar datar dengan `parentName` seperti
 * rancangan awal doc 07): tidak ada nama induk yang bisa salah ketik, dan fitur ke-i pasti lengkap
 * begitu fitur ke-(i+1) mulai ditulis, sehingga bisa disimpan selagi model masih menulis.
 */
export const featureOutputSchema = z.object({
  name: textField,
  summary: z.string().max(600),
  icon: z.string().max(40),
  phase: z.number().int().min(1).max(10),
  subFeatures: z.array(subFeatureOutputSchema).min(1).max(8),
});
export type FeatureOutput = z.infer<typeof featureOutputSchema>;

export const roadmapOutputSchema = z.object({
  title: textField,
  features: z.array(featureOutputSchema).min(3).max(10),
});
export type RoadmapOutput = z.infer<typeof roadmapOutputSchema>;
