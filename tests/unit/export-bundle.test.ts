import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  type ExportFeature,
  exportFiles,
  featureMarkdown,
  zipFiles,
} from "@/features/export/bundle";

const feature: ExportFeature = {
  name: "Booking Dokter",
  summary: "Pasien memesan jadwal.",
  spec: "### Tujuan\nPasien bisa memesan.\n\n### Yang dibutuhkan\n- Layar jadwal\n",
  subFeatures: [
    { name: "Pilih Jam", summary: "Memilih slot.", spec: "### Tujuan\nSlot terpilih.\n" },
  ],
  tasks: [
    {
      title: "Buat API",
      description: "Endpoint booking.",
      prompt: "Kerjakan API booking.",
    },
    {
      title: "Tulis README",
      description: "Dokumentasi.",
      prompt: "Contoh:\n```bash\npnpm dev\n```",
    },
  ],
};

describe("featureMarkdown (doc 04)", () => {
  it("judul, ringkasan, spesifikasi, sub-fitur, lalu task bernomor dengan prompt di blok kode", () => {
    expect(featureMarkdown(feature)).toBe(
      `${[
        "# Booking Dokter",
        "Pasien memesan jadwal.",
        "## Spesifikasi\n\n### Tujuan\nPasien bisa memesan.\n\n### Yang dibutuhkan\n- Layar jadwal",
        "## Sub-fitur: Pilih Jam",
        "Memilih slot.",
        "### Tujuan\nSlot terpilih.",
        "## Task",
        "### 1. Buat API",
        "Endpoint booking.",
        "**Prompt:**",
        "```\nKerjakan API booking.\n```",
        "### 2. Tulis README",
        "Dokumentasi.",
        "**Prompt:**",
        "````\nContoh:\n```bash\npnpm dev\n```\n````",
      ].join("\n\n")}\n`,
    );
  });

  it("fitur tanpa task dan spesifikasi tetap punya kerangka bagian", () => {
    const md = featureMarkdown({
      name: "Kosong",
      summary: "",
      spec: "",
      subFeatures: [],
      tasks: [],
    });
    expect(md).toBe("# Kosong\n\n## Spesifikasi\n\n## Task\n");
  });
});

describe("exportFiles dan zip", () => {
  it("PRD.md lalu features/NN-<slug>.md berurutan; slug ganda diberi akhiran", () => {
    const files = exportFiles("# PRD - X", [
      feature,
      { ...feature, name: "Pembayaran QRIS & VA" },
      { ...feature, name: "Booking Dokter!" },
    ]);
    expect(Object.keys(files)).toEqual([
      "PRD.md",
      "features/01-booking-dokter.md",
      "features/02-pembayaran-qris-va.md",
      "features/03-booking-dokter-2.md",
    ]);
    expect(files["PRD.md"]).toBe("# PRD - X\n");
  });

  it("lebar nomor mengikuti jumlah fitur (100+ fitur → 3 digit)", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...feature, name: `F ${i}` }));
    const names = Object.keys(exportFiles("x", many));
    expect(names[1]).toBe("features/001-f-0.md");
    expect(names[100]).toBe("features/100-f-99.md");
  });

  it("ZIP berisi berkas yang sama persis (UTF-8)", () => {
    const files = exportFiles("# PRD - Kafé ☕", [feature]);
    const unzipped = unzipSync(zipFiles(files));
    expect(Object.keys(unzipped).sort()).toEqual(Object.keys(files).sort());
    for (const [path, text] of Object.entries(files)) {
      expect(strFromU8(unzipped[path] ?? new Uint8Array())).toBe(text);
    }
  });
});
