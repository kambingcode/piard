import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function poll(page: Page, path: string, key: string, value: string) {
  await expect
    .poll(async () => (await (await page.request.get(path)).json())[key], {
      timeout: 30_000,
    })
    .toBe(value);
}

test("ponsel: spesifikasi & task dan kanban tanpa gulir horizontal; status lewat menu", async ({
  page,
}) => {
  await signIn(page);
  const created = await (
    await page.request.post("/api/plan/create", {
      data: { idea: "Aplikasi jadwal piket kebersihan untuk kos." },
    })
  ).json();
  const id: string = created.plan.id;
  await page.request.post("/api/plan/questions", { data: { planId: id } });
  await page.request.patch(`/api/plan/${id}`, { data: { step: 4 } });
  await page.request.post("/api/plan/roadmap/generate", { data: { planId: id } });
  await poll(page, `/api/plan/roadmap/generate?planId=${id}`, "status", "ready");
  await page.request.post("/api/plan/generate", { data: { planId: id } });
  await poll(page, `/api/plan/generate?planId=${id}`, "status", "ready");

  await page.goto(`/plans/${id}/tasks`);
  await expect(page.getByText(/7\/7 fitur lengkap · 21 task$/)).toBeVisible({
    timeout: 30_000,
  });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const copyButton = page.getByRole("button", { name: /^Salin prompt: / }).first();
  expect((await copyButton.boundingBox())?.height).toBeGreaterThanOrEqual(40);

  await page.goto(`/plans/${id}/kanban`);
  const todo = page.getByRole("region", { name: "Todo" });
  await expect(todo.getByText("21 task")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const card = todo.locator("li").first();
  const title = (await card.locator("p").first().textContent()) ?? "";
  const menu = card.getByLabel(`Pindahkan "${title}" ke`);
  expect((await menu.boundingBox())?.height).toBeGreaterThanOrEqual(40);
  await menu.selectOption("doing");
  await expect(
    page.getByRole("region", { name: "Dikerjakan" }).getByText(title, { exact: true }),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
