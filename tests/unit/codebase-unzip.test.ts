import { strToU8, Zip, ZipDeflate, ZipPassThrough, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ArchiveError, extractZip } from "@/features/codebase/scan/unzip";

/** Arsip streaming (data descriptor, tanpa ukuran di header lokal) seperti buatan beberapa alat. */
function streamingZip(files: Record<string, Uint8Array>, stored = false): Uint8Array {
  const parts: Uint8Array[] = [];
  const zip = new Zip((error, data) => {
    if (error) throw error;
    parts.push(data);
  });
  for (const [name, content] of Object.entries(files)) {
    const file = stored ? new ZipPassThrough(name) : new ZipDeflate(name);
    zip.add(file);
    file.push(content, true);
  }
  zip.end();
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function expectProblem(run: () => unknown, problem: ArchiveError["problem"]) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `diharapkan ArchiveError ${problem}`).toBeInstanceOf(ArchiveError);
  expect((thrown as ArchiveError).problem).toBe(problem);
}

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe("extractZip: arsip normal", () => {
  it("mengurai berkas teks dan melewati folder abaikan tanpa mengurainya", () => {
    const zip = zipSync({
      "toko-main/README.md": strToU8("# Toko"),
      "toko-main/src/app.ts": strToU8("export {}"),
      "toko-main/src/": new Uint8Array(0),
      "toko-main/node_modules/x/index.js": strToU8("module.exports = 1"),
      "toko-main/logo.png": new Uint8Array([1, 2, 3]),
    });
    const { entries, skipped } = extractZip(zip);
    expect(entries.map((e) => e.path).sort()).toEqual([
      "toko-main/README.md",
      "toko-main/src/app.ts",
    ]);
    expect(text(entries.find((e) => e.path.endsWith("README.md"))?.bytes)).toBe("# Toko");
    expect(skipped).toEqual({ ignored_dir: 1, binary: 1 });
  });

  it("mendukung arsip dengan data descriptor dan entri stored", () => {
    const deflated = extractZip(
      streamingZip({ "a.ts": strToU8("satu"), "b/c.ts": strToU8("dua") }),
    );
    expect(deflated.entries.map((e) => [e.path, text(e.bytes)])).toEqual([
      ["a.ts", "satu"],
      ["b/c.ts", "dua"],
    ]);
    const stored = extractZip(streamingZip({ "a.ts": strToU8("tanpa kompresi") }, true));
    expect(text(stored.entries[0]?.bytes)).toBe("tanpa kompresi");
  });

  it("menormalkan jalur bergaya Windows", () => {
    const { entries } = extractZip(zipSync({ "src\\win.ts": strToU8("x") }));
    expect(entries[0]?.path).toBe("src/win.ts");
  });
});

describe("extractZip: arsip ditolak", () => {
  it("bukan ZIP dan ZIP kosong", () => {
    expectProblem(() => extractZip(strToU8("ini teks biasa, bukan zip")), "not_zip");
    expectProblem(() => extractZip(new Uint8Array(0)), "not_zip");
    // Arsip kosong: hanya end-of-central-directory (22 byte).
    const empty = zipSync({});
    expect(empty.length).toBe(22);
    expectProblem(() => extractZip(empty), "empty");
  });

  it("zip-slip, jalur absolut, dan huruf drive menolak seluruh arsip", () => {
    for (const name of [
      "../../etc/cron.d/evil",
      "src/../../x.ts",
      "/etc/passwd",
      "C:/Windows/x.ts",
    ]) {
      expectProblem(
        () => extractZip(zipSync({ "ok.ts": strToU8("a"), [name]: strToU8("jahat") })),
        "unsafe_path",
      );
    }
  });

  it("arsip terpotong dianggap rusak", () => {
    const zip = zipSync(
      { "a.ts": strToU8("x".repeat(50_000)), "b.ts": strToU8("y".repeat(50_000)) },
      { level: 0 },
    );
    expectProblem(
      () => extractZip(zip.subarray(0, Math.floor(zip.length / 2))),
      "corrupt",
    );
  });

  it("terlalu banyak entri", () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 30; i++) files[`f${i}.ts`] = strToU8("x");
    expectProblem(
      () => extractZip(zipSync(files), { maxEntries: 20 }),
      "too_many_entries",
    );
    expect(extractZip(zipSync(files), { maxEntries: 30 }).entries).toHaveLength(30);
  });
});

describe("extractZip: bom ZIP", () => {
  // 20 MB nol terkompresi jadi ±20 KB: rasio ±1.000×.
  const zeros = new Uint8Array(20 * 1024 * 1024);

  it("berhenti begitu byte terurai nyata melewati batas total", () => {
    const bomb = streamingZip({ "a.txt": zeros, "b.txt": zeros });
    expect(bomb.length).toBeLessThan(200_000);
    expectProblem(
      () =>
        extractZip(bomb, {
          maxExtractedBytes: 5 * 1024 * 1024,
          maxFileBytes: 50 * 1024 * 1024,
        }),
      "extracted_too_large",
    );
  });

  it("berkas yang diam-diam lebih besar dari klaimnya dilewati sebagai too_large", () => {
    // Arsip streaming tidak membawa ukuran asli, jadi batas per berkas hanya bisa ditegakkan saat mengurai.
    const result = extractZip(
      streamingZip({ "besar.txt": zeros, "kecil.ts": strToU8("ok") }),
      {
        maxFileBytes: 1024 * 1024,
      },
    );
    expect(result.entries.map((e) => e.path)).toEqual(["kecil.ts"]);
    expect(result.skipped).toEqual({ too_large: 1 });
  });

  it("berkas besar dengan ukuran jujur dilewati tanpa diurai", () => {
    const result = extractZip(
      zipSync({ "besar.txt": zeros, "kecil.ts": strToU8("ok") }),
      {
        maxFileBytes: 1024 * 1024,
        // Batas total kecil: bila berkas besar ikut diurai, galat extracted_too_large akan muncul.
        maxExtractedBytes: 2 * 1024 * 1024,
      },
    );
    expect(result.entries.map((e) => e.path)).toEqual(["kecil.ts"]);
    expect(result.skipped).toEqual({ too_large: 1 });
  });

  it("bom di dalam node_modules tidak pernah diurai", () => {
    const result = extractZip(
      streamingZip({ "node_modules/bom/a.txt": zeros, "src/app.ts": strToU8("ok") }),
      { maxExtractedBytes: 1024 * 1024 },
    );
    expect(result.entries.map((e) => e.path)).toEqual(["src/app.ts"]);
    expect(result.skipped).toEqual({ ignored_dir: 1 });
  });
});
