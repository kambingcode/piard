import { describe, expect, it } from "vitest";
import { easeOutQuint, scrollDuration } from "@/lib/smooth-scroll";

describe("smooth-scroll", () => {
  it("easing mulai di 0, berakhir di 1, dan melambat menjelang tujuan", () => {
    expect(easeOutQuint(0)).toBe(0);
    expect(easeOutQuint(1)).toBe(1);
    // Separuh waktu pertama sudah menempuh hampir seluruh jarak; sisanya pelan.
    expect(easeOutQuint(0.5)).toBeGreaterThan(0.9);
    expect(easeOutQuint(1) - easeOutQuint(0.9)).toBeLessThan(easeOutQuint(0.1));
  });

  it("durasi mengikuti jarak dalam batas 350–900 ms", () => {
    expect(scrollDuration(0)).toBe(350);
    expect(scrollDuration(-1000)).toBe(550);
    expect(scrollDuration(20000)).toBe(900);
  });
});
