import { expect, signIn, test } from "./fixtures";

test("ponsel: pengaturan terbaca tanpa gulir horizontal dan dibuka dari menu", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "Buka menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Pengaturan" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // Lembar menu tertutup sendiri setelah tautan diklik, agar halaman tujuan bisa dipakai.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("Spesifikasi", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const save = await page.getByRole("button", { name: "Simpan" }).boundingBox();
  expect(save?.height).toBeGreaterThanOrEqual(44);
});
