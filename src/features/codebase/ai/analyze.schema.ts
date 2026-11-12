import { z } from "zod";
import { DOC_CONTENT_MAX_LENGTH } from "../schemas";

/** Batas keluaran per langkah; keluaran yang lebih panjang ditolak skema (model diminta ringkas). */
export const PROFILE_TEXT_MAX = 4_000;
export const SUMMARY_MAX = 12_000;

/** Langkah 1 (profil): gambaran awal dari pohon folder dan berkas kunci. */
export const profileOutputSchema = z.object({
  purpose: z.string().trim().min(1).max(PROFILE_TEXT_MAX),
  architecture: z.string().trim().max(PROFILE_TEXT_MAX),
  entryPoints: z.array(z.string().trim().min(1).max(300)).max(20),
  modules: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        paths: z.array(z.string().trim().min(1).max(300)).max(10),
        purpose: z.string().trim().max(500),
      }),
    )
    .max(30),
});
export type ProfileOutput = z.infer<typeof profileOutputSchema>;

/** Langkah 2 (ringkas per potongan): catatan Markdown bersekat untuk satu potongan berkas. */
export const summaryOutputSchema = z.object({
  summary: z.string().trim().min(1).max(SUMMARY_MAX),
});
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

/** Langkah 3 (sintesis): isi satu halaman dokumentasi standar. */
export const pageOutputSchema = z.object({
  content: z.string().trim().min(1).max(DOC_CONTENT_MAX_LENGTH),
});
export type PageOutput = z.infer<typeof pageOutputSchema>;
