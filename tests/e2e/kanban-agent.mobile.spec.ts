import { type Page, request as playwrightRequest } from "@playwright/test";
import { agent, boardWithTasks, createAgentToken } from "./agent-helpers";
import { expect, signIn, test } from "./fixtures";

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("ponsel: empat kolom bertumpuk, Hubungkan AI, dan tinjau card AI tanpa gulir horizontal", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const planId = await boardWithTasks(
    page,
    "Aplikasi daftar belanja bersama untuk keluarga.",
  );
  const token = await createAgentToken(page, planId, "Ponsel uji");
  const api = await playwrightRequest.newContext({ baseURL: page.url() });
  const bot = agent(api, token);
  const { task } = (await bot.next()).body;
  await bot.claim(task.id);
  await bot.report(task.id, "Daftar belanja bersama selesai dikerjakan.");

  await page.goto(`/plans/${planId}/kanban`);
  for (const name of ["Todo", "Dikerjakan", "Review", "Selesai"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const card = page.locator(`li[data-task-id="${task.id}"]`);
  await expect(page.getByRole("region", { name: "Review" }).locator("li")).toHaveCount(1);
  const approve = card.getByRole("button", { name: `Setujui "${task.title}"` });
  expect((await approve.boundingBox())?.height).toBeGreaterThanOrEqual(40);

  await page.getByRole("button", { name: "Hubungkan AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Hubungkan AI ke kanban ini" });
  await expect(
    dialog.getByRole("listitem").filter({ hasText: "Ponsel uji" }),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await dialog.getByRole("button", { name: "Tutup" }).click();

  await approve.click();
  await expect(
    page
      .getByRole("region", { name: "Selesai" })
      .locator(`li[data-task-id="${task.id}"]`),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await api.dispose();
});
