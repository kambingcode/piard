import { describe, expect, it } from "vitest";
import { resolveStep, stepName, WIZARD_STEPS } from "@/features/plans/wizard";

describe("wizard", () => {
  it("punya empat langkah bernama", () => {
    expect(WIZARD_STEPS).toEqual([1, 2, 3, 4]);
    expect(WIZARD_STEPS.map(stepName)).toEqual([
      "Ide",
      "Teknologi",
      "Pertanyaan",
      "Struktur",
    ]);
    expect(stepName(9)).toBe("");
  });

  it("resolveStep menerima langkah yang sudah dicapai", () => {
    expect(resolveStep("1", 3)).toBe(1);
    expect(resolveStep("3", 3)).toBe(3);
  });

  it.each([
    undefined,
    "",
    "abc",
    "0",
    "-1",
    "2.5",
    "4",
    "99",
  ])("resolveStep %j jatuh ke langkah terjauh (3)", (requested) => {
    expect(resolveStep(requested, 3)).toBe(3);
  });
});
