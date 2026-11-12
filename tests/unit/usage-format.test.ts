import { describe, expect, it } from "vitest";
import { budgetRatio, formatCount, formatUsd, taskLabel } from "@/features/usage";

describe("format pemakaian", () => {
  it("USD dua desimal, empat desimal di bawah satu sen, nol tetap nol", () => {
    expect(formatUsd(10)).toBe("US$10,00");
    expect(formatUsd(0.0012)).toBe("US$0,0012");
    expect(formatUsd(0)).toBe("US$0,00");
  });

  it("angka token memakai pemisah ribuan Indonesia", () => {
    expect(formatCount(1234567)).toBe("1.234.567");
  });

  it("label tugas, termasuk gabungan satu job dan tugas yang tidak dikenal", () => {
    expect(taskLabel(["spec", "tasks"])).toBe("Spesifikasi + Task");
    expect(taskLabel(["lain"])).toBe("lain");
  });

  it("rasio batas dibatasi 0..1 dan null tanpa batas", () => {
    expect(budgetRatio(2, 10)).toBe(0.2);
    expect(budgetRatio(15, 10)).toBe(1);
    expect(budgetRatio(1, null)).toBeNull();
    expect(budgetRatio(0, 0)).toBe(1);
  });
});
