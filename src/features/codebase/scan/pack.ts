import {
  ANALYSIS_CHUNK_TOKENS,
  ANALYSIS_FILE_TOKENS,
  ANALYSIS_TOTAL_TOKENS,
  CHARS_PER_TOKEN,
} from "../limits";
import { depth } from "./paths";
import { keyPriority } from "./rules";
import type { SourceFile } from "./scan-repo";

export type PackedFile = { path: string; text: string; truncated: boolean };
export type Chunk = { files: PackedFile[]; tokens: number };

export type PackResult = {
  chunks: Chunk[];
  /** Jalur yang isinya dipotong agar muat. */
  truncated: string[];
  /** Jalur yang tidak masuk sama sekali karena anggaran total habis. */
  dropped: string[];
  tokens: number;
};

export type PackOptions = {
  totalTokens?: number;
  chunkTokens?: number;
  fileTokens?: number;
};

/** Estimasi token yang sama dengan perkiraan biaya (M7-12). */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / CHARS_PER_TOKEN);

/** Ruang untuk penanda "… [dipotong: …]" agar hasil potongan tetap ≤ `maxTokens`. */
const MARKER_RESERVE_CHARS = 64;

/** Memotong teks di batas baris terdekat agar tidak melebihi `maxTokens` (termasuk penandanya). */
function truncate(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, maxTokens * CHARS_PER_TOKEN - MARKER_RESERVE_CHARS);
  const cut = text.slice(0, maxChars);
  const lastNewline = cut.lastIndexOf("\n");
  const kept = lastNewline > maxChars / 2 ? cut.slice(0, lastNewline) : cut;
  const remaining = text.slice(kept.length).split("\n").length;
  return `${kept}\n… [dipotong: ±${remaining} baris lagi]`;
}

/**
 * Mengelompokkan berkas ke potongan yang muat anggaran token, untuk diringkas per potongan (M7-10).
 * Berkas kunci dan yang dangkal lebih dulu; berkas yang lebih besar dari `fileTokens` dipotong; berkas
 * yang tidak muat anggaran total dicatat di `dropped`. Deterministik.
 */
export function packFiles(
  files: readonly SourceFile[],
  options: PackOptions = {},
): PackResult {
  const totalBudget = options.totalTokens ?? ANALYSIS_TOTAL_TOKENS;
  const chunkBudget = options.chunkTokens ?? ANALYSIS_CHUNK_TOKENS;
  // Satu berkas tidak pernah lebih besar dari satu potongan.
  const fileBudget = Math.min(options.fileTokens ?? ANALYSIS_FILE_TOKENS, chunkBudget);

  const ordered = [...files].sort(
    (a, b) =>
      keyPriority(a.key) - keyPriority(b.key) ||
      depth(a.path) - depth(b.path) ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );

  const chunks: Chunk[] = [];
  const truncated: string[] = [];
  const dropped: string[] = [];
  let used = 0;
  let current: Chunk = { files: [], tokens: 0 };

  for (const file of ordered) {
    let text = file.text;
    let tokens = estimateTokens(text);
    let cut = false;
    if (tokens > fileBudget) {
      text = truncate(text, fileBudget);
      tokens = estimateTokens(text);
      cut = true;
    }
    if (used + tokens > totalBudget) {
      dropped.push(file.path);
      continue;
    }
    if (current.files.length > 0 && current.tokens + tokens > chunkBudget) {
      chunks.push(current);
      current = { files: [], tokens: 0 };
    }
    current.files.push({ path: file.path, text, truncated: cut });
    current.tokens += tokens;
    used += tokens;
    if (cut) truncated.push(file.path);
  }
  if (current.files.length > 0) chunks.push(current);

  return { chunks, truncated, dropped, tokens: used };
}
