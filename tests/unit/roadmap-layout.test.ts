import { describe, expect, it } from "vitest";
import {
  canvasHeightFor,
  computeLayout,
  LAYOUT,
  READABLE,
  readableViewport,
  subBoxHeight,
} from "@/features/roadmap/layout";

const overlaps = (a: { y: number; h: number }, b: { y: number; h: number }) =>
  a.y < b.y + b.h && b.y < a.y + a.h;

describe("subBoxHeight", () => {
  it("0 tanpa sub-fitur, tanpa footer bila muat, dengan footer bila lebih dari 3", () => {
    expect(subBoxHeight(0, false)).toBe(0);
    const three = subBoxHeight(3, false);
    expect(subBoxHeight(2, false)).toBeLessThan(three);
    expect(subBoxHeight(4, false)).toBe(three + LAYOUT.subFooter);
    expect(subBoxHeight(5, true)).toBe(three + LAYOUT.subFooter + 2 * LAYOUT.subRow);
  });
});

describe("computeLayout", () => {
  const input = {
    featureIds: ["a", "b", "c"],
    subCounts: { a: 4, b: 0, c: 5 },
    expanded: new Set<string>(),
  };

  it("tiga kolom berurutan dari kiri ke kanan", () => {
    const layout = computeLayout(input);
    const a = layout.features.a;
    const box = layout.subBoxes.a;
    expect(a && box).toBeTruthy();
    expect(layout.prd.x).toBe(0);
    expect(a?.x).toBeGreaterThan(LAYOUT.prdWidth);
    expect(box?.x).toBeGreaterThan((a?.x ?? 0) + LAYOUT.featureWidth);
    expect(layout.width).toBe((box?.x ?? 0) + LAYOUT.subWidth);
  });

  it("fitur tanpa sub-fitur tidak punya kotak", () => {
    expect(computeLayout(input).subBoxes.b).toBeUndefined();
  });

  it("baris tidak pernah bertumpuk, juga saat kotak dibuka penuh", () => {
    for (const expanded of [new Set<string>(), new Set(["a", "c"])]) {
      const layout = computeLayout({ ...input, expanded });
      const rows = input.featureIds.map((id) => {
        const box = layout.subBoxes[id];
        const f = layout.features[id] ?? { y: 0 };
        const top = Math.min(f.y, box?.y ?? f.y);
        const bottom = Math.max(
          f.y + LAYOUT.featureHeight,
          (box?.y ?? 0) + (box?.height ?? 0),
        );
        return { y: top, h: bottom - top };
      });
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const cur = rows[i];
        if (!prev || !cur) throw new Error("baris kurang");
        expect(overlaps(prev, cur)).toBe(false);
      }
    }
  });

  it("membuka kotak menambah tinggi graf dan menunjukkan semua baris", () => {
    const closed = computeLayout(input);
    const open = computeLayout({ ...input, expanded: new Set(["c"]) });
    expect(open.height).toBeGreaterThan(closed.height);
    expect(open.subBoxes.c?.visibleRows).toBe(5);
    expect(closed.subBoxes.c?.visibleRows).toBe(3);
  });

  it("node PRD berada di tengah tinggi graf; graf kosong tetap punya tinggi", () => {
    const layout = computeLayout(input);
    expect(layout.prd.y).toBeCloseTo((layout.height - LAYOUT.prdHeight) / 2);
    const empty = computeLayout({ featureIds: [], subCounts: {}, expanded: new Set() });
    expect(empty.height).toBe(LAYOUT.prdHeight);
    expect(empty.prd.y).toBe(0);
  });
});

describe("readableViewport dan canvasHeightFor", () => {
  const graph = { width: 900, height: 1400 };

  it("zoom 1 dan di tengah bila kanvas cukup lebar", () => {
    expect(readableViewport(graph, 1100)).toEqual({ x: 100, y: 24, zoom: 1 });
  });

  it("mengecil mengikuti lebar, tetapi tidak di bawah batas terbaca", () => {
    expect(readableViewport(graph, 798).zoom).toBeCloseTo(0.833, 2);
    const narrow = readableViewport(graph, 300);
    expect(narrow.zoom).toBe(READABLE.minZoom);
    expect(narrow.x).toBe(READABLE.padding);
  });

  it("kanvas setinggi graf pada zoom terbaca, minimal 480px", () => {
    expect(canvasHeightFor(graph, 1100)).toBe(1400 + 48);
    expect(canvasHeightFor({ width: 900, height: 64 }, 1100)).toBe(480);
  });
});
