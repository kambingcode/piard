import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Aturan arsitektur yang tidak bisa dinyatakan sebagai graf impor
 * (yang itu ada di .dependency-cruiser.cjs). Lihat docs/architecture.md.
 */

const SRC = join(__dirname, "..", "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((absolute) => ({
  path: relative(SRC, absolute).split(sep).join("/"),
  text: readFileSync(absolute, "utf8"),
}));

/** Kode yang hanya boleh berjalan di server. */
const isServerFile = (path: string) =>
  path.startsWith("server/") ||
  /^features\/[^/]+\/server\//.test(path) ||
  /^features\/[^/]+\/server\.ts$/.test(path);

/**
 * Berkas server yang dimuat di luar bundler Next (drizzle-kit membaca skema langsung)
 * sehingga tidak boleh mengimpor `server-only`. Isinya hanya definisi tabel dan tipe.
 */
const SERVER_ONLY_EXEMPT = new Set(["server/db/schema.ts", "server/db/json-types.ts"]);

/** `NEXT_RUNTIME` hanya bisa dibaca dari `process.env` di titik masuk instrumentation. */
const PROCESS_ENV_ALLOWED = new Set(["server/config/env.ts", "instrumentation.ts"]);

describe("aturan arsitektur", () => {
  it("memindai berkas sumber", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("process.env hanya dibaca di server/config/env.ts", () => {
    const offenders = files
      .filter((f) => !PROCESS_ENV_ALLOWED.has(f.path))
      .filter((f) => /\bprocess\.env\b/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("setiap berkas server mengawali dengan import 'server-only'", () => {
    const offenders = files
      .filter((f) => isServerFile(f.path) && !SERVER_ONLY_EXEMPT.has(f.path))
      .filter((f) => !/^import ["']server-only["'];?\s*$/m.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("berkas klien tidak mengimpor 'server-only' (cukup kode server saja)", () => {
    const offenders = files
      .filter((f) => !isServerFile(f.path) && !f.path.startsWith("app/api/"))
      .filter((f) => /["']server-only["']/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("tidak ada default export kecuali konvensi berkas Next", () => {
    const nextConventions =
      /(^|\/)(page|layout|loading|error|global-error|not-found|template|default|route|proxy|instrumentation|opengraph-image|icon|apple-icon|sitemap|robots|manifest)\.(ts|tsx)$/;
    const offenders = files
      .filter((f) => !nextConventions.test(f.path))
      .filter((f) => /^export default\b/m.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
