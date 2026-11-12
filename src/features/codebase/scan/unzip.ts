import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { MAX_ARCHIVE_ENTRIES, MAX_EXTRACTED_BYTES, MAX_FILE_BYTES } from "../limits";
import { normalizeEntryPath } from "./paths";
import { type SkipReason, skipReasonForPath } from "./rules";
import type { RawEntry } from "./scan-repo";

export type ArchiveProblem =
  | "not_zip"
  | "empty"
  | "too_many_entries"
  | "extracted_too_large"
  | "unsafe_path"
  | "corrupt";

/** Arsip ditolak utuh; `problem` dipetakan ke pesan pengguna oleh service. */
export class ArchiveError extends Error {
  constructor(
    readonly problem: ArchiveProblem,
    readonly detail?: string,
  ) {
    super(`Arsip ditolak: ${problem}${detail ? ` (${detail})` : ""}`);
    this.name = "ArchiveError";
  }
}

export type ExtractLimits = {
  maxEntries: number;
  maxFileBytes: number;
  maxExtractedBytes: number;
};

const DEFAULT_LIMITS: ExtractLimits = {
  maxEntries: MAX_ARCHIVE_ENTRIES,
  maxFileBytes: MAX_FILE_BYTES,
  maxExtractedBytes: MAX_EXTRACTED_BYTES,
};

/**
 * Ukuran potongan masukan ke parser. Deflate bisa mengembang ±1.000×, dan satu `push` mengurai seluruh
 * potongannya sebelum batas sempat diperiksa; 16 KB membatasi lonjakan memori per langkah ke ±16 MB
 * (diukur saat merancang: potongan 64 KB berisi nol menghasilkan 3 MB sekaligus).
 */
const PUSH_CHUNK_BYTES = 16 * 1024;

/** Tanda tangan ZIP: entri lokal (`PK\x03\x04`) atau direktori pusat kosong (`PK\x05\x06`). */
function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))
  );
}

/** Dilempar dari dalam callback untuk menghentikan parser; ditangkap di bawah. */
class Stop extends Error {
  constructor(readonly reason: ArchiveError) {
    super(reason.message);
  }
}

export type ExtractResult = {
  entries: RawEntry[];
  /** Berkas yang dilewati tanpa diurai (folder abaikan, biner, …) atau dihentikan karena terlalu besar. */
  skipped: Partial<Record<SkipReason, number>>;
};

/**
 * Mengurai ZIP **di memori** (tidak ada yang ditulis ke disk, ADR 0016). Berkas yang jalurnya sudah pasti
 * dilewati tidak pernah diurai; ukuran dihitung dari byte yang benar-benar terurai, bukan dari ukuran yang
 * diklaim arsip, sehingga bom ZIP berhenti begitu batas terlampaui.
 *
 * @throws {ArchiveError} bila arsip bukan ZIP, kosong, rusak, berisi jalur berbahaya, atau melewati batas.
 */
export function extractZip(
  bytes: Uint8Array,
  options: Partial<ExtractLimits> & {
    /**
     * Hanya berkas yang lolos predikat ini yang diproses (mis. subfolder repo GitHub). Berkas lain tidak
     * diurai dan tidak dihitung sebagai dilewati; jalur yang tidak aman tetap menolak arsip.
     */
    include?: (path: string) => boolean;
  } = {},
): ExtractResult {
  const { maxEntries, maxFileBytes, maxExtractedBytes, include } = {
    ...DEFAULT_LIMITS,
    ...options,
  };
  if (!looksLikeZip(bytes)) throw new ArchiveError("not_zip");

  const entries: RawEntry[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  const skip = (reason: SkipReason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  let entryCount = 0;
  let extracted = 0;
  /** Berkas yang sudah dimulai tetapi belum menerima potongan terakhir (arsip terpotong). */
  const pending = new Set<string>();

  const unzip = new Unzip((file) => {
    entryCount += 1;
    if (entryCount > maxEntries) {
      throw new Stop(new ArchiveError("too_many_entries", String(maxEntries)));
    }
    const normalized = normalizeEntryPath(file.name);
    if (normalized.kind === "unsafe") {
      throw new Stop(new ArchiveError("unsafe_path", normalized.reason));
    }
    if (normalized.kind === "dir") return;

    const { path } = normalized;
    if (include && !include(path)) return;
    const reason = skipReasonForPath(path);
    if (reason) return skip(reason);
    // Ukuran yang diklaim arsip hanya dipakai untuk melewati lebih awal; batas sebenarnya dihitung di bawah.
    if (file.originalSize !== undefined && file.originalSize > maxFileBytes) {
      return skip("too_large");
    }
    if (file.compression !== 0 && file.compression !== 8) return skip("unsupported");

    const parts: Uint8Array[] = [];
    let size = 0;
    let oversized = false;
    pending.add(path);
    file.ondata = (error, chunk, final) => {
      if (error) {
        // fflate menangkap galat dari callback ini lalu memanggilnya lagi dengan galat itu sebagai
        // `error`; penghenti milik kita diteruskan apa adanya agar alasannya tidak tertimpa "corrupt".
        if (error instanceof Stop) throw error;
        throw new Stop(new ArchiveError("corrupt", error.message));
      }
      extracted += chunk.length;
      if (extracted > maxExtractedBytes) {
        throw new Stop(
          new ArchiveError("extracted_too_large", String(maxExtractedBytes)),
        );
      }
      if (!oversized) {
        size += chunk.length;
        if (size > maxFileBytes) {
          // Ukuran yang diklaim berbohong: buang yang sudah terkumpul dan hentikan berkas ini saja.
          oversized = true;
          parts.length = 0;
          file.terminate();
          pending.delete(path);
          skip("too_large");
          return;
        }
        parts.push(chunk);
      }
      if (final && !oversized) {
        pending.delete(path);
        entries.push({ path, bytes: concat(parts, size) });
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  try {
    for (let offset = 0; offset < bytes.length; offset += PUSH_CHUNK_BYTES) {
      const end = Math.min(offset + PUSH_CHUNK_BYTES, bytes.length);
      unzip.push(bytes.subarray(offset, end), end === bytes.length);
    }
  } catch (error) {
    if (error instanceof Stop) throw error.reason;
    throw new ArchiveError("corrupt", error instanceof Error ? error.message : undefined);
  }
  if (pending.size > 0) throw new ArchiveError("corrupt", "berkas terpotong");
  if (entryCount === 0) throw new ArchiveError("empty");
  return { entries, skipped };
}

function concat(parts: readonly Uint8Array[], size: number): Uint8Array {
  if (parts.length === 1 && parts[0]) return parts[0];
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
