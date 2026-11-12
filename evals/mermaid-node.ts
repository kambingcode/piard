import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * `mermaid.parse` yang bisa dipakai di Node (tes dan eval). Di luar browser, DOMPurify milik mermaid tidak
 * punya `addHook`/`sanitize`, sehingga **semua** diagram berlabel gagal dengan "DOMPurify.addHook is not a
 * function" walau sintaksnya benar. Sanitasi tidak relevan untuk memeriksa sintaks, jadi instance yang
 * dipakai mermaid diberi pengganti tanpa-op sebelum mermaid dimuat.
 */
let ready: Promise<(source: string) => Promise<unknown>> | undefined;

async function load() {
  const fromMermaid = createRequire(createRequire(import.meta.url).resolve("mermaid"));
  let dir = dirname(fromMermaid.resolve("dompurify"));
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
  const purify = (await import(pathToFileURL(join(dir, "dist/purify.es.mjs")).href))
    .default;
  if (typeof purify.addHook !== "function") {
    Object.assign(purify, {
      addHook() {},
      removeHook() {},
      removeHooks() {},
      sanitize: (value: unknown) => String(value),
    });
  }
  const { default: mermaid } = await import("mermaid");
  return (source: string) => mermaid.parse(source);
}

/** @throws galat parse mermaid bila sintaks diagram salah. */
export async function parseMermaid(source: string): Promise<unknown> {
  ready ??= load();
  return (await ready)(source);
}
