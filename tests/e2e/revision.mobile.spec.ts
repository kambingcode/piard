import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("ponsel: chat revisi dibuka sebagai lembar, bisa mengirim pesan, tanpa gulir horizontal", async ({
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
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/plan/roadmap/generate?planId=${id}`)).json())
          .status,
      { timeout: 20_000 },
    )
    .toBe("ready");

  await page.goto(`/plans/${id}/prd`);
  await expect(page.getByText(/^Versi 1 · disimpan /)).toBeVisible({ timeout: 20_000 });

  const open = page.getByRole("button", { name: "Chat revisi" });
  expect((await open.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await open.click();
  const sheet = page.getByRole("dialog", { name: "Chat revisi" });
  await sheet
    .getByLabel("Pesan untuk AI")
    .fill("Apa langkah pertama yang paling penting?");
  await sheet.getByRole("button", { name: "Kirim" }).click();
  await expect(sheet.getByText(/Risiko utamanya ada di adopsi awal/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await sheet.getByRole("button", { name: "Tutup chat" }).click();
  await expect(sheet).toBeHidden();
});
