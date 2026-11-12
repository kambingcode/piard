import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Contoh respons asli yang diamati dari situs acuan (analysis/api-samples/). */
const SAMPLES_DIR = join(__dirname, "..", "..", "..", "analysis", "api-samples");

/** Contoh respons tidak ikut repo publik; tes yang memakainya dilewati bila foldernya tidak ada. */
export const HAS_SAMPLES = existsSync(SAMPLES_DIR);

export function loadSample(name: string): unknown {
  return JSON.parse(readFileSync(join(SAMPLES_DIR, name), "utf8"));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
