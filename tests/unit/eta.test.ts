import { describe, expect, it } from "vitest";
import { estimateRemainingMs, remainingMinutes } from "@/lib/eta";

describe("perkiraan sisa waktu", () => {
  it("belum ada yang selesai sejak pengamatan pertama: belum bisa diperkirakan", () => {
    expect(estimateRemainingMs({ at: 0, done: 2 }, 60_000, 2, 7)).toBeNull();
  });

  it("memakai laju sejak pengamatan pertama, bukan sejak job mulai", () => {
    // 2 fitur selesai dalam 60 detik sejak panel tampil, 3 tersisa → 90 detik
    expect(estimateRemainingMs({ at: 1_000, done: 2 }, 61_000, 4, 7)).toBe(90_000);
  });

  it("semua selesai: tidak ada perkiraan", () => {
    expect(estimateRemainingMs({ at: 0, done: 0 }, 10_000, 7, 7)).toBeNull();
  });

  it("menit dibulatkan ke atas, minimal satu", () => {
    expect(remainingMinutes(5_000)).toBe(1);
    expect(remainingMinutes(61_000)).toBe(2);
  });
});
