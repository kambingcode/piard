import { expect, OWNER, signIn, test } from "./fixtures";

test("ponsel: bilah atas dengan menu, tanpa gulir horizontal", async ({ page }) => {
  await signIn(page);

  // Rail dan sidebar tidak muncul di ponsel; navigasi lewat menu.
  await expect(page.getByRole("button", { name: "Buka menu" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Buka menu" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("link", { name: "Plan baru" })).toBeVisible();
  await expect(menu.getByText(OWNER.email)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("ponsel: target sentuh tombol utama minimal 44px", async ({ page }) => {
  await page.goto("/sign-in");
  const box = await page.getByRole("button", { name: "Masuk" }).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});
