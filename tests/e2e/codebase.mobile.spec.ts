import type { Page } from "@playwright/test";
import { analyzedCodebase } from "./codebase-helpers";
import { expect, signIn, test } from "./fixtures";

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("ponsel: alur proyek eksisting, tiga sumber, tanpa gulir horizontal", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/plan?flow=existing");
  await expect(
    page.getByRole("heading", { name: "Analisis proyek eksisting" }),
  ).toBeVisible();
  for (const [source, submit] of [
    ["Prompt untuk agen", "Buat dan lihat prompt"],
    ["Upload ZIP", "Unggah"],
    ["URL GitHub", "Ambil repo"],
  ] as const) {
    await page.getByText(source, { exact: true }).click();
    const button = page.getByRole("button", { name: submit });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await horizontalOverflow(page), source).toBeLessThanOrEqual(0);
  }
});

test("ponsel: dokumentasi dipilih lewat daftar halaman, diagram dan editor tanpa gulir horizontal", async ({
  page,
}) => {
  await signIn(page);
  const id = await analyzedCodebase(page, "Toko Ponsel");
  await page.goto(`/codebases/${id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Ringkasan" })).toBeVisible();
  // Navigasi samping disembunyikan di ponsel; diganti pilihan halaman.
  await expect(
    page.getByRole("navigation", { name: "Halaman dokumentasi" }),
  ).toBeHidden();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByLabel("Pilih halaman").selectOption("arsitektur");
  await expect(page).toHaveURL(/\?page=arsitektur$/);
  await expect(page.locator("svg[id^='mermaid']").first()).toBeVisible({
    timeout: 15_000,
  });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Ubah" }).click();
  await expect(page.getByLabel("Isi halaman (Markdown)")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.goto("/codebases");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Toko Ponsel" }),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test("ponsel: jalur agen, tempel hasil bersekat menjadi dokumentasi", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/plan?flow=existing");
  await page.getByLabel("Nama proyek").fill("Agen Ponsel");
  await page.getByRole("button", { name: "Buat dan lihat prompt" }).click();
  await expect(
    page.getByRole("heading", { name: "Menunggu hasil dari agen" }),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Kosong: tombol nonaktif. Sekat tak dikenal ditolak di kolomnya. Hasil bersekat tersimpan sebagai versi agen.
  await expect(page.getByRole("button", { name: "Simpan hasil" })).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Hasil dari agen" })
    .fill("<!-- piard:page rahasia -->\nisi");
  await page.getByRole("button", { name: "Simpan hasil" }).click();
  await expect(page.getByRole("textbox", { name: "Hasil dari agen" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page
    .getByRole("textbox", { name: "Hasil dari agen" })
    .fill(
      "<!-- piard:page ringkasan -->\n# Ringkasan\nAplikasi kasir.\n\n<!-- piard:page modul -->\n# Modul\n- `src/kasir`",
    );
  await page.getByRole("button", { name: "Simpan hasil" }).click();
  await expect(page.getByText("2 halaman disimpan.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Ringkasan" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Aplikasi kasir.")).toBeVisible();
  await expect(page.getByText(/^Versi 1 · agen · /)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
