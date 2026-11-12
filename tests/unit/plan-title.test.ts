import { describe, expect, it } from "vitest";
import { planTitle } from "@/features/plans/title";

describe("planTitle", () => {
  it("memakai judul bila ada", () => {
    expect(planTitle({ title: "Booking Klinik", idea: "apa saja" })).toBe(
      "Booking Klinik",
    );
  });

  it("memakai ide utuh bila pendek, dengan spasi dirapikan", () => {
    expect(planTitle({ title: null, idea: "  Tracker\n  pengeluaran  " })).toBe(
      "Tracker pengeluaran",
    );
  });

  it("memangkas ide panjang di batas kata dengan elipsis", () => {
    const idea =
      "Aplikasi booking klinik untuk pasien dan dokter dengan pembayaran online dan pengingat";
    const title = planTitle({ title: null, idea });
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(idea.startsWith(title.slice(0, -1))).toBe(true);
    expect(title.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("memangkas kata yang sangat panjang tanpa spasi", () => {
    expect(planTitle({ title: null, idea: "x".repeat(100) })).toBe(`${"x".repeat(60)}…`);
  });
});
