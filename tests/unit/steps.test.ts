import { describe, expect, it } from "vitest";
import { type Step, summarizeSteps } from "@/lib/steps";

const step = (id: string, status: Step["status"]): Step => ({ id, label: id, status });

describe("summarizeSteps", () => {
  it("melipat langkah selesai di awal dan menampilkan sisanya", () => {
    const result = summarizeSteps([
      step("a", "done"),
      step("b", "done"),
      step("c", "running"),
      step("d", "pending"),
    ]);
    expect(result.done).toBe(2);
    expect(result.total).toBe(4);
    expect(result.collapsible.map((s) => s.id)).toEqual(["a", "b"]);
    expect(result.visible.map((s) => s.id)).toEqual(["c", "d"]);
    expect(result.current?.id).toBe("c");
  });

  it("tidak melipat apa pun bila semua selesai agar hasil tetap terbaca", () => {
    const result = summarizeSteps([step("a", "done"), step("b", "done")]);
    expect(result.collapsible).toEqual([]);
    expect(result.visible).toHaveLength(2);
    expect(result.current).toBeUndefined();
  });

  it("tidak melipat langkah selesai yang muncul setelah langkah belum selesai", () => {
    const result = summarizeSteps([step("a", "pending"), step("b", "done")]);
    expect(result.collapsible).toEqual([]);
    expect(result.visible.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("menandai langkah gagal sebagai langkah saat ini", () => {
    const result = summarizeSteps([
      step("a", "done"),
      step("b", "failed"),
      step("c", "pending"),
    ]);
    expect(result.current?.id).toBe("b");
    expect(result.collapsible.map((s) => s.id)).toEqual(["a"]);
  });

  it("menangani daftar kosong", () => {
    expect(summarizeSteps([])).toEqual({
      done: 0,
      total: 0,
      current: undefined,
      collapsible: [],
      visible: [],
    });
  });
});
