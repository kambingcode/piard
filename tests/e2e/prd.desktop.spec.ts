import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

// Akun pemilik dibuat oleh auth.desktop.spec.ts (berkas ini berjalan sesudahnya).
test.describe.configure({ mode: "serial" });

const IDEA =
  "Aplikasi katering harian untuk karyawan kantor, pesan menu sehari sebelumnya.";
let planId = "";

/** Plan baru dengan roadmap yang sudah jadi (LLM mock). */
async function planWithRoadmap(page: Page): Promise<string> {
  const created = await (
    await page.request.post("/api/plan/create", { data: { idea: IDEA } })
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
  return id;
}

test("dari roadmap ke PRD: dibuat otomatis, 7 bagian, kedua diagram tergambar", async ({
  page,
}) => {
  await signIn(page);
  planId = await planWithRoadmap(page);
  await page.goto(`/plans/${planId}?step=4`);
  await page.getByRole("link", { name: "Lanjutkan ke PRD" }).click();
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}/prd$`));

  const doc = page.getByRole("article", { name: "Dokumen PRD" });
  await expect(doc.getByRole("heading", { level: 2, name: /^PRD - / })).toBeVisible({
    timeout: 20_000,
  });
  for (const section of [
    "1. Ringkasan",
    "2. Kebutuhan",
    "3. Fitur Inti",
    "4. Alur Pengguna",
    "5. Arsitektur",
    "6. Skema Database",
    "7. Desain & Batasan Teknis",
  ]) {
    await expect(doc.getByRole("heading", { level: 3, name: section })).toBeVisible();
  }
  await expect(
    page.getByRole("figure", { name: "Diagram sequenceDiagram" }).locator("svg"),
  ).toBeVisible();
  await expect(
    page.getByRole("figure", { name: "Diagram erDiagram" }).locator("svg"),
  ).toBeVisible();
  // Fitur roadmap ikut masuk ke bagian Fitur Inti.
  await expect(doc.getByText("Pencarian Layanan").first()).toBeVisible();
  await expect(page.getByText(/^Versi 1 · disimpan /)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("muat ulang menampilkan PRD tersimpan tanpa membuat job baru", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/prd`);
  await expect(page.getByText(/^Versi 1 · disimpan /)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Menyusun PRD" })).toHaveCount(0);
});

test("buat ulang dikonfirmasi dan menyimpan versi 2", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/prd`);
  await page.getByRole("button", { name: "Buat ulang" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("versi sekarang tetap ada");
  await dialog.getByRole("button", { name: "Buat ulang" }).click();
  await expect(page.getByText(/^Versi 2 · disimpan /)).toBeVisible({ timeout: 20_000 });
});

test("edit Markdown dengan pratinjau, simpan menjadi versi 3; batal dengan perubahan dikonfirmasi", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/prd`);
  await page.getByText("Edit", { exact: true }).click();
  const editor = page.getByLabel("Isi PRD (Markdown)");
  await expect(editor).toHaveValue(/^# PRD - /);
  await expect(page.getByRole("button", { name: "Simpan" })).toBeDisabled();

  await editor.fill(
    "# PRD - Versi Saya\n\n## 1. Ringkasan\n\nDitulis ulang oleh pemilik.\n",
  );
  const preview = page.getByRole("region", { name: "Pratinjau" });
  await expect(preview.getByText("Ditulis ulang oleh pemilik.")).toBeVisible();

  // Batal dengan perubahan meminta konfirmasi; "Lanjut edit" mempertahankan suntingan.
  await page.getByRole("button", { name: "Batal" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Lanjut edit" })
    .click();
  await expect(editor).toHaveValue(/Ditulis ulang oleh pemilik/);

  await editor.press("ControlOrMeta+s");
  await expect(page.getByText("Tersimpan sebagai versi 3.")).toBeVisible();
  const doc = page.getByRole("article", { name: "Dokumen PRD" });
  await expect(doc.getByText("Ditulis ulang oleh pemilik.")).toBeVisible();
  await expect(page.getByText(/^Versi 3 · disimpan /)).toBeVisible();

  await page.reload();
  await expect(doc.getByText("Ditulis ulang oleh pemilik.")).toBeVisible();
});

test("versi lama bisa dibaca lalu dipulihkan sebagai versi terbaru", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/prd`);
  const select = page.getByLabel("Versi", { exact: true });
  await expect(select.locator("option")).toHaveCount(3);
  await select.selectOption("1");
  await expect(page.getByText("Anda melihat versi 1 dari 3.")).toBeVisible();
  const doc = page.getByRole("article", { name: "Dokumen PRD" });
  await expect(
    doc.getByRole("heading", { level: 3, name: "6. Skema Database" }),
  ).toBeVisible();
  // Versi lama hanya bisa dibaca.
  await expect(page.getByRole("radio", { name: "Edit" })).toBeDisabled();

  // Diff terhadap versi terbaru: ringkasan dan baris bertanda, lalu kembali ke dokumen.
  await page.getByRole("button", { name: "Bandingkan dengan terbaru" }).click();
  const diff = page.getByRole("region", { name: "Perbedaan versi 1 dan 3" });
  await expect(diff).toContainText(
    /Dari versi 1 ke 3: \d+ baris ditambah, \d+ baris dihapus\./,
  );
  await expect(diff.getByText("Ditambah:").first()).toBeAttached();
  await page.getByRole("button", { name: "Dokumen", exact: true }).click();
  await expect(doc).toBeVisible();

  await page.getByRole("button", { name: "Pulihkan versi ini" }).click();
  await expect(page.getByText("Versi 1 dipulihkan sebagai versi 4.")).toBeVisible();
  await expect(page.getByText("Anda melihat versi")).toHaveCount(0);
  await expect(page.getByText(/^Versi 4 · disimpan /)).toBeVisible();
  await expect(select).toHaveValue("4");
});

test("unduh Markdown memberi berkas <slug>-PRD.md berisi PRD terbaru", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/prd`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Unduh .md" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^aplikasi-katering[a-z0-9-]*-PRD\.md$/);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  expect(await readFile(path, "utf8")).toMatch(/^# PRD - /);
});

test("halaman PRD untuk plan yang belum sampai roadmap dialihkan ke wizard", async ({
  page,
}) => {
  await signIn(page);
  const created = await (
    await page.request.post("/api/plan/create", { data: { idea: IDEA } })
  ).json();
  await page.goto(`/plans/${created.plan.id}/prd`);
  await expect(page).toHaveURL(new RegExp(`/plans/${created.plan.id}\\?step=2$`));
});

test("endpoint PRD menolak permintaan tanpa sesi", async ({ request }) => {
  const response = await request.get(`/api/plan/generate?planId=${planId}`);
  expect(response.status()).toBe(401);
});
