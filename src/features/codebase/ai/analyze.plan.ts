/**
 * Rencana job `codebase-analyze` (M7-10) dan perkiraan biayanya (M7-12). Fungsi murni: job dan
 * perkiraan memakai rencana yang sama, jadi perkiraan dihitung dari prompt yang benar-benar dikirim.
 */
import { ESTIMATE_CHARS_PER_TOKEN } from "../limits";
import { type Chunk, type PackedFile, packFiles } from "../scan/pack";
import type { SourceFile } from "../scan/scan-repo";
import { type CodebaseLanguage, type DetectedStack, DOC_PAGES } from "../schemas";
import {
  buildPagePrompt,
  buildProfilePrompt,
  buildSummaryPrompt,
  SUMMARY_SECTIONS,
  type SummarySection,
} from "./analyze.prompt";
import type { ProfileOutput } from "./analyze.schema";

/** Anggaran berkas kunci (README, manifes, konfigurasi, skema) untuk langkah profil. */
export const KEY_FILE_TOKENS = 12_000;
const KEY_FILE_EACH_TOKENS = 3_000;
const PROFILE_KINDS = new Set([
  "readme",
  "manifest",
  "config",
  "schema",
  "entry",
  "docs",
]);

/** Token keluaran rata-rata per panggilan, terukur pada eval M7-11 dengan Haiku (repo `app`, 500 berkas). */
export const OUTPUT_ESTIMATE = { profile: 1_800, summary: 3_500, page: 4_200 } as const;
/** Ukuran ringkasan nyata ±rata-rata keluaran langkah 2, untuk memperkirakan masukan sintesis. */
const SUMMARY_ESTIMATE_CHARS = OUTPUT_ESTIMATE.summary * ESTIMATE_CHARS_PER_TOKEN;

/** Token tokenizer dari karakter (perkiraan biaya). */
export const estimateModelTokens = (text: string): number =>
  Math.ceil(text.length / ESTIMATE_CHARS_PER_TOKEN);
/** Porsi tiap bagian dalam ringkasan (diamati pada eval M7-11), untuk ringkasan pengganti. */
const SECTION_SHARE: Record<SummarySection, number> = {
  modul: 0.35,
  data: 0.15,
  api: 0.15,
  alur: 0.15,
  konfigurasi: 0.1,
  catatan: 0.1,
};

/** Ringkasan pengganti berjudul bagian, agar pemilahan per halaman ikut terhitung di perkiraan. */
const placeholderSummary = (chars: number) =>
  SUMMARY_SECTIONS.map(
    (section) =>
      `## ${section}\n${"x".repeat(Math.floor(chars * SECTION_SHARE[section]))}\n`,
  ).join("");

export type AnalysisPlan = {
  paths: string[];
  keyFiles: PackedFile[];
  chunks: Chunk[];
  truncated: string[];
  dropped: string[];
};

/** Berkas kunci untuk profil, dan seluruh berkas dalam potongan untuk diringkas. */
export function planAnalysis(files: readonly SourceFile[]): AnalysisPlan {
  const keys = files.filter((f) => f.key !== null && PROFILE_KINDS.has(f.key));
  const keyPack = packFiles(keys, {
    totalTokens: KEY_FILE_TOKENS,
    chunkTokens: KEY_FILE_TOKENS,
    fileTokens: KEY_FILE_EACH_TOKENS,
  });
  const pack = packFiles(files);
  return {
    paths: files.map((f) => f.path),
    keyFiles: keyPack.chunks.flatMap((c) => c.files),
    chunks: pack.chunks,
    truncated: pack.truncated,
    dropped: pack.dropped,
  };
}

/** Profil pengganti berukuran wajar untuk memperkirakan prompt yang memuat profil. */
const PLACEHOLDER_PROFILE: ProfileOutput = {
  purpose: "x".repeat(400),
  architecture: "x".repeat(600),
  entryPoints: ["x".repeat(30), "x".repeat(30)],
  // ±1.800 token keluaran profil nyata ≈ 3.800 karakter.
  modules: Array.from({ length: 14 }, () => ({
    name: "x".repeat(15),
    paths: ["x".repeat(30)],
    purpose: "x".repeat(80),
  })),
};

const promptTokens = (p: { system: string; prompt: string }) =>
  estimateModelTokens(p.system) + estimateModelTokens(p.prompt);

export type CallEstimate = { inputTokens: number; outputTokens: number };

export type AnalysisTokens = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Per panggilan: harga dihitung per panggilan (tarif konteks panjang berlaku per panggilan). */
  perCall: CallEstimate[];
};

/** Perkiraan token seluruh job dari rencananya (tanpa memanggil model). */
export function estimateAnalysisTokens(
  plan: AnalysisPlan,
  meta: { name: string; language: CodebaseLanguage; stack: DetectedStack },
): AnalysisTokens {
  const perCall: CallEstimate[] = [
    {
      inputTokens: promptTokens(
        buildProfilePrompt({ ...meta, paths: plan.paths, keyFiles: plan.keyFiles }),
      ),
      outputTokens: OUTPUT_ESTIMATE.profile,
    },
  ];
  plan.chunks.forEach((chunk, index) => {
    perCall.push({
      inputTokens: promptTokens(
        buildSummaryPrompt({
          ...meta,
          profile: PLACEHOLDER_PROFILE,
          chunk,
          index,
          total: plan.chunks.length,
        }),
      ),
      outputTokens: OUTPUT_ESTIMATE.summary,
    });
  });
  const fakeSummaries = plan.chunks.map(() => placeholderSummary(SUMMARY_ESTIMATE_CHARS));
  for (const page of DOC_PAGES) {
    perCall.push({
      inputTokens: promptTokens(
        buildPagePrompt({
          ...meta,
          slug: page.slug,
          profile: PLACEHOLDER_PROFILE,
          summaries: fakeSummaries,
          paths: plan.paths,
        }),
      ),
      outputTokens: OUTPUT_ESTIMATE.page,
    });
  }
  return {
    calls: perCall.length,
    inputTokens: perCall.reduce((sum, c) => sum + c.inputTokens, 0),
    outputTokens: perCall.reduce((sum, c) => sum + c.outputTokens, 0),
    perCall,
  };
}
