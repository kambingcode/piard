import { MAX_PATH_DEPTH, MAX_PATH_LENGTH } from "../limits";

export type EntryPath =
  | { kind: "file"; path: string }
  | { kind: "dir" }
  | { kind: "unsafe"; reason: string };

/**
 * Menormalkan nama entri arsip menjadi jalur relatif bergaya POSIX.
 *
 * Arsip tidak pernah diekstrak ke disk (ADR 0016), jadi jalur berbahaya tidak bisa menimpa apa pun;
 * tetapi `..`, jalur absolut, huruf drive, dan byte NUL hanya muncul di arsip rusak atau buatan, sehingga
 * seluruh arsip ditolak agar tidak ada kejutan di tahap berikutnya.
 */
export function normalizeEntryPath(raw: string): EntryPath {
  if (raw.includes("\0")) return { kind: "unsafe", reason: "byte NUL" };
  const slashed = raw.replace(/\\/g, "/");
  if (slashed.startsWith("/")) return { kind: "unsafe", reason: "jalur absolut" };
  if (/^[A-Za-z]:/.test(slashed)) return { kind: "unsafe", reason: "huruf drive" };

  const isDir = slashed.endsWith("/");
  const segments = slashed.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.some((s) => s === "..")) return { kind: "unsafe", reason: "segmen .." };
  if (segments.length === 0) return { kind: "dir" };

  const path = segments.join("/");
  if (path.length > MAX_PATH_LENGTH || segments.length > MAX_PATH_DEPTH) {
    return { kind: "unsafe", reason: "jalur terlalu panjang" };
  }
  return isDir ? { kind: "dir" } : { kind: "file", path };
}

/**
 * Folder pembungkus tunggal yang dipakai semua jalur (mis. `repo-main/` dari arsip GitHub), atau null.
 * Hanya dilepas bila setiap berkas ada di dalamnya; satu berkas di akar berarti tidak ada pembungkus.
 */
export function wrapperFolder(paths: readonly string[]): string | null {
  let wrapper: string | null = null;
  for (const path of paths) {
    const slash = path.indexOf("/");
    if (slash === -1) return null;
    const top = path.slice(0, slash);
    if (wrapper === null) wrapper = top;
    else if (wrapper !== top) return null;
  }
  return wrapper;
}

export const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export const extension = (path: string): string => {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
};

export const depth = (path: string): number => path.split("/").length - 1;
