import { describe, expect, it } from "vitest";
import { SLUG_MAX_LENGTH, slugify } from "@/lib/slug";

describe("slugify", () => {
  it("huruf kecil, selain huruf/angka menjadi tanda hubung", () => {
    expect(slugify("Booking Klinik & Apotek 24/7!")).toBe("booking-klinik-apotek-24-7");
  });

  it("melepas aksen dan membuang tanda hubung di tepi", () => {
    expect(slugify("  Café Résumé  ")).toBe("cafe-resume");
  });

  it("dipotong 60 karakter tanpa tanda hubung di akhir", () => {
    const slug = slugify(`${"a".repeat(59)} bcd`);
    expect(slug).toBe("a".repeat(59));
    expect(slugify("kata ".repeat(30)).length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
  });

  it("memakai cadangan bila tidak ada huruf/angka", () => {
    expect(slugify("!!! ???")).toBe("plan");
    expect(slugify("", "prd")).toBe("prd");
  });
});
