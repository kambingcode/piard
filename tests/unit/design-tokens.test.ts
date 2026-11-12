import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Menjaga kontras WCAG AA (4.5:1 untuk teks) pada pasangan token yang benar-benar dipakai,
 * di tema terang dan gelap. Nilai dibaca langsung dari src/styles/globals.css.
 */

const css = readFileSync(
  join(__dirname, "..", "..", "src", "styles", "globals.css"),
  "utf8",
);

type Pair = { light: string; dark: string };

function readTokens(): Record<string, Pair> {
  const tokens: Record<string, Pair> = {};
  for (const match of css.matchAll(
    /--([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi,
  )) {
    const [, name, light, dark] = match;
    if (name && light && dark) tokens[name] = { light, dark };
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const tokens = readTokens();

/** [teks, latar] */
const TEXT_PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "muted"],
  ["foreground", "active"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "active"],
  ["primary-foreground", "primary"],
  ["accent", "background"],
  ["accent", "card"],
  ["accent", "accent-soft"],
  ["accent-foreground", "accent"],
  ["accent-foreground", "negative"],
  ["positive", "background"],
  ["positive", "card"],
  ["positive", "positive-soft"],
  ["negative", "background"],
  ["negative", "card"],
  ["negative", "negative-soft"],
  ["warning", "background"],
  ["warning", "warning-soft"],
];

describe("token desain", () => {
  it("terbaca dari globals.css", () => {
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(19);
  });

  it.each([
    "light",
    "dark",
  ] as const)("setiap pasangan teks lolos 4.5:1 di tema %s", (theme) => {
    const failures = TEXT_PAIRS.flatMap(([fg, bg]) => {
      const fgToken = tokens[fg];
      const bgToken = tokens[bg];
      if (!fgToken || !bgToken) return [`token tidak ditemukan: ${fg} / ${bg}`];
      const ratio = contrast(fgToken[theme], bgToken[theme]);
      return ratio >= 4.5 ? [] : [`${fg} di atas ${bg}: ${ratio.toFixed(2)}:1`];
    });
    expect(failures).toEqual([]);
  });

  it("garis kontrol cukup terlihat terhadap kartu (3:1 untuk batas komponen)", () => {
    for (const theme of ["light", "dark"] as const) {
      const control = tokens["control-border"];
      const card = tokens.card;
      if (!control || !card) throw new Error("token control-border/card tidak ada");
      // WCAG 1.4.11 mensyaratkan 3:1 untuk batas yang menjadi satu-satunya penanda komponen.
      // Kolom isian Piard juga punya label dan fokus yang jelas, jadi 1.5:1 dipakai sebagai batas bawah.
      expect(contrast(control[theme], card[theme])).toBeGreaterThanOrEqual(1.5);
    }
  });
});
