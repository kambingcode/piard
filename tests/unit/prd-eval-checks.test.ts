import { describe, expect, it } from "vitest";
import { mockPrd } from "@/features/prd/ai/prd.mock";
import { checkPrd, invalidDiagrams } from "../../evals/prd-checks";

const input = {
  idea: "Aplikasi katering harian untuk kantor",
  language: "id" as const,
  title: "Katering Kantor",
  techStack: {},
  extras: [],
  questionAnswers: { questions: [], answers: {} },
  features: [
    { name: "Menu Harian", summary: "Melihat menu.", phase: 1, subFeatures: [] },
    { name: "Pesan Makan", summary: "Memesan.", phase: 1, subFeatures: [] },
  ],
};

describe("cek eval PRD", () => {
  it("PRD tiruan lolos cek struktur dan diagramnya valid menurut mermaid", async () => {
    const prd = mockPrd(input);
    const failed = (await checkPrd(prd, ["Menu Harian", "Pesan Makan"]))
      .filter((c) => !c.pass)
      .map((c) => c.name);
    // PRD tiruan sengaja pendek; hanya batas jumlah kata yang boleh gagal.
    expect(failed).toEqual(["400-1800 kata"]);
  });

  it("menandai diagram yang tidak bisa di-parse, fitur yang hilang, dan blok kosong", async () => {
    const broken = mockPrd(input).replace(
      "USER ||--o{ ITEM : owns",
      "USER ||--o{ ITEM owns",
    );
    expect(await invalidDiagrams(broken)).toHaveLength(1);

    const checks = await checkPrd(`${broken}\n\`\`\`\n\`\`\`\n`, [
      "Menu Harian",
      "Antar Kurir",
    ]);
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName["diagram valid (mermaid.parse)"]?.pass).toBe(false);
    expect(byName["semua fitur roadmap disebut"]?.detail).toBe("hilang: Antar Kurir");
    expect(byName["pagar kode berpasangan, tanpa blok kosong"]?.pass).toBe(false);
  });
});
