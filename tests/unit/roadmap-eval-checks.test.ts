import { describe, expect, it } from "vitest";
import { mockRoadmap } from "@/features/roadmap/ai/roadmap.mock";
import { checkRoadmap } from "../../evals/roadmap-checks";

const failing = (checks: ReturnType<typeof checkRoadmap>) =>
  checks.filter((c) => !c.pass).map((c) => c.name);

describe("checkRoadmap (evals)", () => {
  it("fixture mock lolos semua cek, termasuk batas waktu", () => {
    expect(failing(checkRoadmap(mockRoadmap("id", "J"), 12_000))).toEqual([]);
  });

  it("menangkap jumlah fitur, fase melompat/tak berurutan, sub-fitur, dan waktu", () => {
    const base = mockRoadmap("id", "J");
    const [a, b] = base.features;
    if (!a || !b) throw new Error("fixture kurang");
    const broken = {
      ...base,
      features: [
        { ...a, phase: 2 },
        { ...b, phase: 1, subFeatures: b.subFeatures.slice(0, 2) },
        { ...a, phase: 4, name: "Nama fitur yang jauh terlalu panjang sekali" },
      ],
    };
    expect(failing(checkRoadmap(broken, 75_000))).toEqual([
      "5-8 fitur",
      "fase berurutan",
      "fase mulai 1 tanpa lompatan",
      "3-5 sub-fitur per fitur",
      "tanpa sub-fitur ganda",
      "nama ringkas (≤ 5 kata)",
      "ready < 60 detik",
    ]);
  });
});

describe("checkNoExistingFeatures (M7-19)", () => {
  it("gagal bila nama fitur sama dengan fitur yang sudah ada (abaikan huruf besar dan spasi)", async () => {
    const { checkNoExistingFeatures } = await import("../../evals/roadmap-checks");
    const roadmap = (names: string[]) => ({ features: names.map((name) => ({ name })) });
    expect(
      checkNoExistingFeatures(roadmap(["Tautan Publik"]), ["Roadmap", "PRD"]).pass,
    ).toBe(true);
    const repeated = checkNoExistingFeatures(roadmap(["  prd ", "Tautan"]), ["PRD"]);
    expect(repeated).toMatchObject({ pass: false, detail: "mengulang:   prd " });
  });
});
