import { MAX_FILE_BYTES, MAX_TEXT_FILES } from "../limits";
import type { CodebaseManifest, DetectedStack } from "../schemas";
import { depth, wrapperFolder } from "./paths";
import { redactSecrets } from "./redact";
import {
  type KeyKind,
  keyKindOf,
  keyPriority,
  languageOf,
  type SkipReason,
  skipReasonForPath,
} from "./rules";
import { detectStack } from "./stack";

/** Berkas mentah dari arsip atau unduhan; jalur sudah dinormalkan (`normalizeEntryPath`). */
export type RawEntry = { path: string; bytes: Uint8Array };

/** Berkas teks yang lolos saringan dan sudah disensor: satu-satunya isi yang boleh disimpan/dikirim. */
export type SourceFile = {
  path: string;
  text: string;
  /** Ukuran asli dalam byte (sebelum sensor). */
  size: number;
  language: string | null;
  key: KeyKind | null;
};

export type ScanResult = {
  files: SourceFile[];
  manifest: CodebaseManifest;
  detectedStack: DetectedStack;
};

/** Byte awal yang diperiksa untuk menebak biner (sama dengan heuristik git). */
const BINARY_SNIFF_BYTES = 8_000;

const decoder = new TextDecoder("utf-8", { fatal: true });

/** Teks UTF-8, atau null bila isinya biner (byte NUL di awal atau UTF-8 tidak valid). */
function decodeText(bytes: Uint8Array): string | null {
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return null;
  try {
    // BOM dibuang agar tidak ikut terhitung dan tidak mengganggu parser JSON manifes.
    return decoder.decode(bytes).replace(/^﻿/, "");
  } catch {
    return null;
  }
}

/** Urutan byte jalur (bukan `localeCompare`) agar hasil sama di mesin mana pun. */
const byPath = (a: { path: string }, b: { path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

const bump = (counts: Record<string, number>, reason: SkipReason, by = 1) => {
  counts[reason] = (counts[reason] ?? 0) + by;
};

/**
 * Menyaring, menyensor, dan meringkas isi repo. Fungsi murni dan deterministik: urutan masukan tidak
 * memengaruhi hasil, kecuali untuk jalur ganda (entri pertama yang dipakai).
 *
 * Langkah: lepas folder pembungkus tunggal → lewati folder dependensi/build, lockfile, biner, kunci
 * privat, berkas > {@link MAX_FILE_BYTES} → sensor rahasia (sebelum apa pun disimpan, ADR 0016) →
 * pertahankan paling banyak {@link MAX_TEXT_FILES} berkas (berkas kunci dan yang dangkal lebih dulu).
 *
 * @param entries berkas mentah.
 * @param preSkipped berkas yang sudah dilewati pemanggil tanpa diurai (mis. `node_modules` di ZIP).
 * @param options.unwrap `false` bila pemanggil sudah melepas pembungkusnya sendiri (unduhan GitHub), agar
 *   subfolder yang kebetulan hanya berisi satu folder tidak ikut dilepas.
 */
export function scanRepo(
  entries: readonly RawEntry[],
  preSkipped: Partial<Record<SkipReason, number>> = {},
  options: { unwrap?: boolean } = {},
): ScanResult {
  const skipped: Record<string, number> = {};
  for (const [reason, count] of Object.entries(preSkipped)) {
    if (count) bump(skipped, reason as SkipReason, count);
  }

  const found =
    options.unwrap === false ? null : wrapperFolder(entries.map((e) => e.path));
  // Pembungkus yang sendirinya folder abaikan (mis. arsip berisi `node_modules/` saja) tidak dilepas.
  const wrapper = found && skipReasonForPath(`${found}/x`) === null ? found : null;
  const strip = (path: string) => (wrapper ? path.slice(wrapper.length + 1) : path);

  // Jalur ganda (hanya muncul di arsip buatan) dipakai sekali: entri pertama menurut urutan arsip.
  // Ini satu-satunya tempat urutan masukan berpengaruh; sesudahnya semua diurutkan menurut jalur.
  const unique = new Map<string, RawEntry>();
  for (const entry of entries) {
    const path = strip(entry.path);
    if (path !== "" && !unique.has(path)) unique.set(path, { path, bytes: entry.bytes });
  }
  const candidates: { file: SourceFile; redactions: number }[] = [];

  for (const entry of [...unique.values()].sort(byPath)) {
    const path = entry.path;

    const reason = skipReasonForPath(path);
    if (reason) {
      bump(skipped, reason);
      continue;
    }
    if (entry.bytes.byteLength > MAX_FILE_BYTES) {
      bump(skipped, "too_large");
      continue;
    }
    const raw = decodeText(entry.bytes);
    if (raw === null) {
      bump(skipped, "binary");
      continue;
    }
    const { text, count } = redactSecrets(path, raw);
    candidates.push({
      file: {
        path,
        text,
        size: entry.bytes.byteLength,
        language: languageOf(path),
        key: keyKindOf(path),
      },
      redactions: count,
    });
  }

  const ranked = [...candidates].sort(
    ({ file: a }, { file: b }) =>
      keyPriority(a.key) - keyPriority(b.key) ||
      depth(a.path) - depth(b.path) ||
      byPath(a, b),
  );
  const kept = ranked.slice(0, MAX_TEXT_FILES);
  if (ranked.length > kept.length) bump(skipped, "too_many", ranked.length - kept.length);
  // Hitungan sensor hanya untuk berkas yang benar-benar disimpan.
  const redactions = kept.reduce((sum, c) => sum + c.redactions, 0);
  const redactedFiles = kept.filter((c) => c.redactions > 0).length;
  const files = kept.map((c) => c.file).sort(byPath);

  const languages: Record<string, number> = {};
  for (const file of files) {
    if (file.language)
      languages[file.language] = (languages[file.language] ?? 0) + file.size;
  }

  return {
    files,
    manifest: {
      files: files.map(({ path, size, language, key }) => ({
        path,
        size,
        language,
        key,
      })),
      totalFiles: files.length,
      totalBytes: files.reduce((sum, f) => sum + f.size, 0),
      skipped,
      redactions,
      redactedFiles,
      languages,
    },
    detectedStack: detectStack(files),
  };
}
