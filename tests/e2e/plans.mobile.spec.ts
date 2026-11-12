import { expect, signIn, test } from "./fixtures";

const horizontalOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

test("ponsel: form ide, wizard, dan pertanyaan nyaman dipakai tanpa gulir horizontal", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/plan?flow=new");

  const submit = page.getByRole("button", { name: "Buat rencana" });
  await page.getByRole("button", { name: /Platform kursus online kecil/ }).click();
  await expect(submit).toBeEnabled();
  expect((await submit.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await submit.click();

  await expect(page).toHaveURL(/step=2$/);
  await expect(page.getByRole("radio", { name: /Biarkan AI pilih/ })).toBeChecked();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Lanjut ke pertanyaan" }).click();

  await expect(page.getByText("Pertanyaan 1 dari 5")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("textbox").first().fill("Guru honorer yang ingin mengajar online");
  const next = page.getByRole("button", { name: "Lanjut", exact: true });
  expect((await next.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await next.click();

  // Pilihan tunggal: baris opsi cukup tinggi untuk disentuh.
  await expect(page.getByText("Pertanyaan 2 dari 5")).toBeVisible();
  const option = page.getByText("Daftar akun");
  expect((await option.boundingBox())?.height).toBeGreaterThan(0);
  await option.click();
  await expect(page.getByRole("radio", { name: "Daftar akun" })).toBeChecked();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Riwayat tersedia lewat menu.
  await page.getByRole("button", { name: "Buka menu" }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /Platform kursus online kecil/ }),
  ).toBeVisible();
});

test("ponsel: roadmap tampil sebagai daftar per fase dan panel detail bisa dipakai", async ({
  page,
}) => {
  await signIn(page);
  const created = await (
    await page.request.post("/api/plan/create", {
      data: { idea: "Aplikasi katering rumahan dengan pesanan harian." },
    })
  ).json();
  const id: string = created.plan.id;
  await page.request.post("/api/plan/questions", { data: { planId: id } });
  await page.request.patch(`/api/plan/${id}`, { data: { step: 4 } });
  await page.goto(`/plans/${id}?step=4`);

  await expect(page.getByRole("link", { name: "Lanjutkan ke PRD" })).toBeVisible({
    timeout: 20_000,
  });
  // Graf tidak dirender di ponsel; daftar bertingkat menggantikannya.
  await expect(page.getByRole("application", { name: "Graf roadmap" })).toHaveCount(0);
  const list = page.getByRole("region", { name: "Daftar fitur roadmap" });
  await expect(list.getByRole("heading", { name: "Fase 1" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const first = list.getByRole("button", { name: /Pencarian Layanan/ });
  expect((await first.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await first.click();
  const panel = page.getByRole("dialog", { name: "Detail fitur" });
  await expect(panel.getByLabel("Nama fitur")).toHaveValue("Pencarian Layanan");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await panel.getByRole("button", { name: "Tutup" }).click();
  await expect(panel).toBeHidden();
});
