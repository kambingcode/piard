import {
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SourceFile } from "@/features/codebase/scan/scan-repo";
import { createSourceStore } from "@/features/codebase/server/source-store";

const HOUR = 60 * 60 * 1000;
const file = (path: string, text: string): SourceFile => ({
  path,
  text,
  size: text.length,
  language: "TypeScript",
  key: null,
});

let root: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "piard-store-"));
  dir = join(root, "tmp", "codebase");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("source store", () => {
  it("menyimpan, membaca, dan menghapus sumber per codebase", () => {
    const store = createSourceStore(dir, 24 * HOUR);
    const now = Date.now();
    store.save("cb-1", [file("a.ts", "isi a")], now);
    store.save("cb-2", [file("b.ts", "isi b")], now);
    expect(store.load("cb-1", now)?.map((f) => f.text)).toEqual(["isi a"]);
    expect(store.load("tidak-ada", now)).toBeNull();

    store.save("cb-1", [file("a.ts", "baru")], now);
    expect(store.load("cb-1", now)?.[0]?.text).toBe("baru");

    store.remove("cb-1");
    expect(store.load("cb-1", now)).toBeNull();
    expect(store.load("cb-2", now)).not.toBeNull();
    store.remove("cb-1"); // menghapus yang sudah tidak ada aman
  });

  it("folder 0700 dan berkas 0600, tanpa sisa berkas sementara", () => {
    const store = createSourceStore(dir);
    store.save("cb-1", [file("a.ts", "x")]);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "cb-1.json")).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(["cb-1.json"]);
  });

  it("sumber kedaluwarsa tidak dibaca dan disapu", () => {
    const store = createSourceStore(dir, 24 * HOUR);
    const saved = Date.now();
    store.save("lama", [file("a.ts", "x")], saved);
    expect(store.load("lama", saved + 23 * HOUR)).not.toBeNull();
    expect(store.load("lama", saved + 25 * HOUR)).toBeNull();

    // Sapuan memakai waktu ubah berkas; sisa tulisan terputus (.tmp) ikut disapu.
    writeFileSync(join(dir, "putus.json.tmp"), "{");
    const old = (Date.now() - 48 * HOUR) / 1000;
    utimesSync(join(dir, "lama.json"), old, old);
    utimesSync(join(dir, "putus.json.tmp"), old, old);
    store.save("baru", [file("b.ts", "y")]);
    expect(readdirSync(dir).sort()).toEqual(["baru.json"]);
    expect(store.sweep()).toBe(0);
  });

  it("berkas rusak dibaca sebagai tidak ada; id aneh ditolak", () => {
    const store = createSourceStore(dir);
    store.save("cb-1", []);
    writeFileSync(join(dir, "cb-1.json"), "{bukan json");
    expect(store.load("cb-1")).toBeNull();
    expect(() => store.save("../keluar", [])).toThrow();
    expect(() => store.load("../../etc/passwd")).not.toThrow();
    expect(store.load("../../etc/passwd")).toBeNull();
  });

  it("sapuan pada folder yang belum ada tidak membuat galat", () => {
    expect(createSourceStore(join(root, "belum-ada")).sweep()).toBe(0);
  });
});
