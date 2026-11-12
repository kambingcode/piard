import { describe, expect, it } from "vitest";
import { mockPrd } from "@/features/prd/ai/prd.mock";
import { buildPrdPrompt, type PrdPromptInput } from "@/features/prd/ai/prd.prompt";
import {
  checkPrdStructure,
  cleanPrd,
  foundSections,
  isCompletePrd,
  mermaidBlocks,
  PRD_SECTIONS,
} from "@/features/prd/structure";

const input: PrdPromptInput = {
  idea: "Aplikasi booking klinik untuk pasien",
  language: "id",
  title: "Booking Klinik",
  techStack: {
    backend: "Node.js",
    database: "ai-pilih",
    frontend: "ai-pilih",
    deployment: "ai-pilih",
  },
  extras: [],
  questionAnswers: {
    questions: [
      {
        id: "q1",
        question: "Siapa penggunanya?",
        type: "text",
        options: [],
        required: true,
      },
      {
        id: "q2",
        question: "Dilewati?",
        type: "text",
        options: [],
        required: false,
      },
    ],
    answers: { q1: "Pasien klinik gigi", q2: "  " },
  },
  features: [
    {
      name: "Cari Dokter",
      summary: "Menemukan dokter.",
      phase: 1,
      subFeatures: [{ name: "Filter Spesialis", summary: "Menyaring." }],
    },
    { name: "Booking", summary: "Memesan jadwal.", phase: 2, subFeatures: [] },
  ],
};

describe("buildPrdPrompt", () => {
  it("meminta tujuh bagian berjudul persis dan dua diagram mermaid", () => {
    const { system } = buildPrdPrompt(input);
    PRD_SECTIONS.id.forEach((name, i) => {
      expect(system).toContain(`## ${i + 1}. ${name}`);
    });
    expect(system).toContain("# PRD - <nama produk>");
    expect(system).toContain("sequenceDiagram");
    expect(system).toContain("erDiagram");
    expect(system).toContain("Bahasa Indonesia");
  });

  it("memuat judul, ide, jawaban, teknologi pilihan, dan roadmap; tanpa yang dilewati", () => {
    const { prompt } = buildPrdPrompt(input);
    expect(prompt).toContain("Nama produk: Booking Klinik");
    expect(prompt).toContain("Pasien klinik gigi");
    expect(prompt).not.toContain("Dilewati?");
    expect(prompt).toContain("backend: Node.js");
    expect(prompt).not.toContain("ai-pilih");
    expect(prompt).toContain("- Cari Dokter (Fase 1): Menemukan dokter.");
    expect(prompt).toContain("    - Filter Spesialis: Menyaring.");
  });

  it("memakai judul bagian bahasa Inggris untuk plan berbahasa Inggris", () => {
    const { system } = buildPrdPrompt({ ...input, language: "en" });
    expect(system).toContain("## 1. Overview");
    expect(system).toContain("English");
  });
});

describe("struktur PRD", () => {
  it("PRD tiruan lengkap untuk kedua bahasa", () => {
    for (const language of ["id", "en"] as const) {
      const prd = mockPrd({ ...input, language });
      expect(isCompletePrd(checkPrdStructure(prd))).toBe(true);
      expect(prd).toContain("Cari Dokter");
    }
  });

  it("melaporkan bagian dan diagram yang hilang", () => {
    const s = checkPrdStructure("## 1. Ringkasan\nteks\n## 3. Fitur\n");
    expect(s).toEqual({
      hasTitle: false,
      missingSections: [2, 4, 5, 6, 7],
      hasSequenceDiagram: false,
      hasErDiagram: false,
    });
  });

  it("menghitung bagian yang sudah mulai ditulis (untuk progres)", () => {
    expect(foundSections("# PRD\n## 1. A\n## 2. B\n## 2. B lagi\n## 9. X")).toEqual([
      1, 2,
    ]);
    expect(foundSections("## 3.")).toEqual([]);
  });

  it("mengambil isi blok mermaid", () => {
    expect(
      mermaidBlocks("a\n```mermaid\nerDiagram\n  A ||--o{ B : x\n```\nb\n```js\nx\n```"),
    ).toEqual(["erDiagram\n  A ||--o{ B : x"]);
  });
});

describe("cleanPrd", () => {
  it("membuang pembungkus ```markdown dan teks sebelum judul", () => {
    expect(cleanPrd("```markdown\n# PRD - X\n\n## 1. A\n```")).toBe(
      "# PRD - X\n\n## 1. A\n",
    );
    expect(cleanPrd("Berikut PRD-nya:\n\n# PRD - X\nisi")).toBe("# PRD - X\nisi\n");
    expect(cleanPrd("  # PRD - X\r\nisi  ")).toBe("# PRD - X\nisi\n");
  });

  it("mempertahankan blok kode di dalam dokumen", () => {
    const doc = "# PRD - X\n\n```mermaid\nerDiagram\n```\n\nakhir";
    expect(cleanPrd(doc)).toBe(`${doc}\n`);
  });
});

describe("cleanPrd dengan pembuka dan pembungkus sekaligus", () => {
  it("membuang pagar penutup yang tidak berpasangan", () => {
    const doc = "# PRD - X\n\n```mermaid\nerDiagram\n```";
    expect(cleanPrd(`Berikut:\n\`\`\`markdown\n${doc}\n\`\`\``)).toBe(`${doc}\n`);
  });
});

describe("cleanPrd dengan pagar ganda (pola Nemotron)", () => {
  it("menyatukan ``` + ```mermaid dan ``` + ``` menjadi satu blok", () => {
    const raw =
      "# PRD - X\n\nteks\n\n```\n```mermaid\nsequenceDiagram\n    U->>A: x\n```\n```\n\n## 6. Y\n```\n```mermaid\nerDiagram\n```\n```\n";
    const clean = cleanPrd(raw);
    expect(clean).toBe(
      "# PRD - X\n\nteks\n\n```mermaid\nsequenceDiagram\n    U->>A: x\n```\n\n## 6. Y\n```mermaid\nerDiagram\n```\n",
    );
    expect(mermaidBlocks(clean)).toEqual(["sequenceDiagram\n    U->>A: x", "erDiagram"]);
  });
});
