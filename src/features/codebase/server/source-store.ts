import "server-only";

import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SOURCE_TTL_MS } from "../limits";
import type { SourceFile } from "../scan/scan-repo";
import type { PageOutcome } from "./docs-writer";

/** Id codebase adalah UUID; pola ini juga mencegah id aneh menjadi jalur di luar folder. */
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const SUFFIX = ".json";
const WORK_SUFFIX = ".work.json";
const TEMP_SUFFIX = ".tmp";

type StoredSource = { version: 1; savedAt: number; files: SourceFile[] };

/**
 * Hasil antara job analisis (M7-10) agar bisa dilanjutkan setelah restart/"Coba lagi". Isinya turunan
 * sumber (ringkasan), jadi siklus hidupnya sama dengan sumber: dihapus bersamanya dan ikut disapu.
 */
export type AnalysisWork = {
  /** Sidik sumber yang dipakai; berbeda = sumber baru, hasil antara lama dibuang. */
  sourceSavedAt: number;
  profile: unknown;
  /** Ringkasan per potongan (indeks = urutan potongan); null = belum. */
  summaries: (string | null)[];
  /** Slug halaman yang sudah ditulis job ini. */
  pages: string[];
  /** Hasil per halaman yang sudah ditulis (ringkasan perubahan, M7-16). */
  outcomes: Partial<Record<string, PageOutcome>>;
};

/**
 * Sumber sementara proyek eksisting: berkas teks yang **sudah disaring dan disensor** (ADR 0016), satu
 * JSON per codebase. Dipakai job analisis lalu dihapus; tidak pernah berisi berkas mentah dari arsip.
 *
 * @param dir folder khusus (dibuat 0700); berkas 0600 agar pengguna lain di mesin tidak bisa membaca.
 * @param ttlMs umur maksimal sebelum dianggap kedaluwarsa dan disapu.
 */
export function createSourceStore(dir: string, ttlMs: number = SOURCE_TTL_MS) {
  const pathFor = (id: string, suffix: string) => {
    if (!SAFE_ID.test(id))
      throw new Error("Id codebase tidak valid untuk sumber sementara");
    return join(dir, `${id}${suffix}`);
  };
  const fileFor = (id: string) => pathFor(id, SUFFIX);
  const workFor = (id: string) => pathFor(id, WORK_SUFFIX);

  /** Tulis atomik (berkas sementara lalu rename) agar pembaca tidak pernah melihat JSON setengah jadi. */
  const writeAtomic = (target: string, body: unknown) => {
    ensureDir();
    const temp = `${target}${TEMP_SUFFIX}`;
    writeFileSync(temp, JSON.stringify(body), { mode: 0o600 });
    renameSync(temp, target);
  };

  const ensureDir = () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // `mode` di mkdirSync diabaikan bila folder sudah ada (dan terpengaruh umask); paksa ulang.
    chmodSync(dir, 0o700);
  };

  return {
    /** Menulis atomik (berkas sementara lalu rename) agar pembaca tidak pernah melihat JSON setengah jadi. */
    save(id: string, files: SourceFile[], now: number = Date.now()): void {
      ensureDir();
      this.sweep(now);
      // Sumber baru: hasil antara analisis sumber lama tidak berlaku lagi.
      rmSync(workFor(id), { force: true });
      const body: StoredSource = { version: 1, savedAt: now, files };
      writeAtomic(fileFor(id), body);
    },

    /** Waktu simpan sumber (sidik untuk hasil antara), atau null bila tidak ada/kedaluwarsa. */
    savedAt(id: string, now: number = Date.now()): number | null {
      try {
        const parsed = JSON.parse(
          readFileSync(fileFor(id), "utf8"),
        ) as Partial<StoredSource>;
        return typeof parsed.savedAt === "number" && now - parsed.savedAt <= ttlMs
          ? parsed.savedAt
          : null;
      } catch {
        return null;
      }
    },

    saveWork(id: string, work: AnalysisWork): void {
      writeAtomic(workFor(id), work);
    },

    /** Hasil antara untuk sumber yang sedang tersimpan, atau null. */
    loadWork(id: string, sourceSavedAt: number): AnalysisWork | null {
      try {
        const parsed = JSON.parse(
          readFileSync(workFor(id), "utf8"),
        ) as Partial<AnalysisWork>;
        if (parsed.sourceSavedAt !== sourceSavedAt || !Array.isArray(parsed.summaries)) {
          return null;
        }
        return {
          sourceSavedAt,
          profile: parsed.profile ?? null,
          summaries: parsed.summaries.map((s) => (typeof s === "string" ? s : null)),
          pages: Array.isArray(parsed.pages)
            ? parsed.pages.filter((p): p is string => typeof p === "string")
            : [],
          outcomes:
            typeof parsed.outcomes === "object" && parsed.outcomes !== null
              ? parsed.outcomes
              : {},
        };
      } catch {
        return null;
      }
    },

    /** Sumber yang tersimpan, atau null bila tidak ada, rusak, atau sudah kedaluwarsa. */
    load(id: string, now: number = Date.now()): SourceFile[] | null {
      let raw: string;
      try {
        raw = readFileSync(fileFor(id), "utf8");
      } catch {
        return null;
      }
      try {
        const parsed = JSON.parse(raw) as Partial<StoredSource>;
        if (parsed.version !== 1 || !Array.isArray(parsed.files)) return null;
        if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > ttlMs)
          return null;
        return parsed.files;
      } catch {
        return null;
      }
    },

    remove(id: string): void {
      for (const path of [fileFor(id), workFor(id)]) {
        rmSync(path, { force: true });
        rmSync(`${path}${TEMP_SUFFIX}`, { force: true });
      }
    },

    /**
     * Menghapus sumber yang lebih tua dari TTL dan sisa tulisan yang terputus. Dipanggil saat boot dan
     * setiap kali menyimpan, jadi proses yang berjalan lama pun tidak menumpuk sumber.
     *
     * @returns jumlah berkas yang dihapus.
     */
    sweep(now: number = Date.now()): number {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return 0;
      }
      let removed = 0;
      for (const name of names) {
        if (!name.endsWith(SUFFIX) && !name.endsWith(TEMP_SUFFIX)) continue;
        const path = join(dir, name);
        try {
          if (now - statSync(path).mtimeMs > ttlMs) {
            rmSync(path, { force: true });
            removed += 1;
          }
        } catch {
          // Berkas bisa hilang di antara readdir dan stat (dihapus proses lain); abaikan.
        }
      }
      return removed;
    },
  };
}

export type SourceStore = ReturnType<typeof createSourceStore>;
