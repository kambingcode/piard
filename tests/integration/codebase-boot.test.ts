import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * M7-21: sumber sementara proyek eksisting disapu saat server mulai. Memanggil `register()` asli dari
 * `instrumentation.ts` (composition root), bukan fungsi sapuannya saja, agar pemasangannya ikut teruji.
 */

const HOUR = 60 * 60 * 1000;
let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "piard-boot-"));
  process.env.DATABASE_PATH = join(root, "piard.db");
  process.env.NEXT_RUNTIME = "nodejs";
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("boot", () => {
  it("menyapu sumber dan hasil antara yang lebih tua dari 24 jam, yang baru tetap", async () => {
    const dir = join(root, "tmp", "codebase");
    mkdirSync(dir, { recursive: true });
    const old = (Date.now() - 25 * HOUR) / 1000;
    for (const name of ["lama.json", "lama.work.json", "putus.json.tmp"]) {
      writeFileSync(join(dir, name), "{}");
      utimesSync(join(dir, name), old, old);
    }
    writeFileSync(join(dir, "baru.json"), "{}");

    const { register } = await import("@/instrumentation");
    await register();

    expect(readdirSync(dir)).toEqual(["baru.json"]);
    expect(existsSync(join(root, "piard.db"))).toBe(true);
  });
});
