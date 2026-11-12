import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { expect } from "./fixtures";

/** ZIP proyek kecil (mode mock: analisis memakai jalur berkas nyata dari arsip ini). */
export function projectZip(extra: Record<string, string> = {}): Buffer {
  const files: Record<string, Uint8Array> = {
    "toko-main/README.md": strToU8("# Toko Daring\nToko untuk UMKM."),
    "toko-main/package.json": strToU8(
      JSON.stringify({ dependencies: { next: "16", react: "19", "drizzle-orm": "1" } }),
    ),
    "toko-main/src/app/page.tsx": strToU8(
      "export default function Page() { return null }",
    ),
    "toko-main/src/features/cart/service.ts": strToU8("export function add() {}"),
    "toko-main/src/server/db.ts": strToU8("export const db = 1"),
    "toko-main/.env": strToU8(
      `ANTHROPIC_API_KEY=sk${"-ant-"}api03-abcdefghijklmnopqrstu`,
    ),
  };
  for (const [path, text] of Object.entries(extra))
    files[`toko-main/${path}`] = strToU8(text);
  return Buffer.from(zipSync(files));
}

/**
 * Proyek ZIP yang sudah dianalisis (mode mock) lewat API dengan sesi halaman, untuk spec yang butuh
 * dokumentasi lengkap tanpa bergantung pada data spec desktop (yang menghapus proyeknya di akhir).
 */
export async function analyzedCodebase(page: Page, name: string): Promise<string> {
  const created = await page.request.post("/api/codebase/create", {
    data: { name, source: "zip", language: "id" },
  });
  expect(created.status()).toBe(200);
  const id: string = (await created.json()).codebase.id;
  await uploadAndAnalyze(page, id, projectZip());
  return id;
}

/** Unggah ZIP ke proyek yang ada lalu analisis sampai siap (juga dipakai untuk analisis ulang). */
export async function uploadAndAnalyze(
  page: Page,
  id: string,
  zip: Buffer,
): Promise<void> {
  const uploaded = await page.request.post(`/api/codebase/${id}/upload`, {
    data: zip,
    headers: { "content-type": "application/zip", "x-file-name": "toko.zip" },
  });
  expect(uploaded.status()).toBe(200);
  const started = await page.request.post(`/api/codebase/${id}/analyze`, {
    data: { confirmed: true },
  });
  expect((await started.json()).started).toBe(true);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/codebase/${id}/status`)).json()).status,
      { timeout: 30_000 },
    )
    .toBe("ready");
}
