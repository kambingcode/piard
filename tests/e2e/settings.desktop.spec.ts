import { expect, signIn, test } from "./fixtures";

test("pengaturan: ganti model dan batas, tersimpan setelah muat ulang, lalu kembali ke .env", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Pengaturan" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Pengaturan", level: 1 })).toBeVisible();
  // Kunci hanya berstatus, tidak pernah bernilai.
  await expect(page.getByText("OPENROUTER_API_KEY")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/sk-(or|ant)-/);

  const prd = page.getByLabel("PRD", { exact: true });
  await prd.fill("vendor/model-uji");
  const daily = page.getByLabel("Harian (USD)");
  await daily.fill("abc");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Isi angka lebih dari 0")).toBeVisible();
  await expect(daily).toHaveAttribute("aria-invalid", "true");

  await daily.fill("2,5");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Pengaturan disimpan.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("PRD", { exact: true })).toHaveValue("vendor/model-uji");
  await expect(page.getByLabel("Harian (USD)")).toHaveValue("2.5");
  await expect(page.getByText("Diubah di sini")).toHaveCount(2);

  await page.getByRole("button", { name: "Pakai nilai .env" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Pakai nilai .env" })
    .click();
  await expect(page.getByText("Nilai .env berlaku lagi.")).toBeVisible();
  await expect(page.getByText("Diubah di sini")).toHaveCount(0);
  await expect(page.getByLabel("PRD", { exact: true })).not.toHaveValue(
    "vendor/model-uji",
  );
});

test("endpoint pengaturan menolak permintaan tanpa sesi", async ({ request }) => {
  expect((await request.get("/api/settings")).status()).toBe(401);
  expect((await request.put("/api/settings", { data: {} })).status()).toBe(401);
});
