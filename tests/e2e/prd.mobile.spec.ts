import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("ponsel: PRD terbaca tanpa gulir horizontal, toolbar bisa disentuh", async ({
  page,
}) => {
  await signIn(page);
  const created = await (
    await page.request.post("/api/plan/create", {
      data: { idea: "Aplikasi antar laundry kiloan untuk kos mahasiswa." },
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
  const doc = page.getByRole("article", { name: "Dokumen PRD" });
  await expect(
    doc.getByRole("heading", { level: 3, name: "7. Desain & Batasan Teknis" }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("figure", { name: "Diagram erDiagram" }).locator("svg"),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  for (const name of ["Unduh .md", "Buat ulang"]) {
    const target = page.getByRole(name === "Unduh .md" ? "link" : "button", { name });
    expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  // Mode edit di ponsel: hanya kolom Markdown (pratinjau di layar lebar), tetap tanpa gulir horizontal.
  await page.getByText("Edit", { exact: true }).click();
  await expect(page.getByLabel("Isi PRD (Markdown)")).toBeVisible();
  await expect(page.getByRole("region", { name: "Pratinjau" })).toBeHidden();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
