import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { expect, signIn, test } from "./fixtures";

// Akun pemilik dibuat oleh auth.desktop.spec.ts (berkas ini berjalan sesudahnya).
test.describe.configure({ mode: "serial" });

const IDEA =
  "Aplikasi antre potong rambut untuk barbershop kecil, pelanggan ambil nomor dari ponsel.";
let planId = "";

test("wizard sampai ekspor: ide → struktur → PRD → spesifikasi & task → ZIP (mock)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  await page.getByRole("link", { name: "Mulai dengan ide" }).click();
  await page.getByLabel("Ide aplikasi").fill(IDEA);
  await page.getByRole("button", { name: "Buat rencana" }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}\?step=2$/);
  planId = new URL(page.url()).pathname.split("/").pop() ?? "";

  await page.getByRole("button", { name: "Lanjut ke pertanyaan" }).click();
  await expect(page.getByText("Pertanyaan 1 dari 5")).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Lewati" }).click();

  await expect(page).toHaveURL(/step=4$/);
  await page.getByRole("link", { name: "Lanjutkan ke PRD" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/prd$/);
  await page.getByRole("link", { name: "Lanjutkan ke spesifikasi & task" }).click({
    timeout: 20_000,
  });
  await expect(page).toHaveURL(/\/tasks$/);

  // Dibuat otomatis; tiap fitur tampil dengan spesifikasi dan task bernomor.
  await expect(
    page.getByText(/^Spesifikasi & task · 7\/7 fitur lengkap · 21 task$/),
  ).toBeVisible({
    timeout: 30_000,
  });
  const feature = page.getByRole("region", { name: "Pencarian Layanan" });
  await expect(feature.getByRole("heading", { level: 3, name: "Tujuan" })).toBeVisible();
  await expect(
    feature.getByRole("heading", { level: 3, name: "Yang dibutuhkan" }),
  ).toBeVisible();
  await expect(
    feature.getByRole("heading", { level: 3, name: "Task (3)" }),
  ).toBeVisible();

  await feature.getByRole("button", { name: "Sub-fitur (4)" }).click();
  await expect(feature.getByText("Cari Layanan", { exact: true })).toBeVisible();

  await feature.getByRole("button", { name: "Lihat prompt" }).first().click();
  await expect(feature.locator("pre").first()).toContainText(
    "Kamu sedang mengerjakan produk",
  );
  await feature
    .getByRole("button", {
      name: "Salin prompt: Buat model data dan API Pencarian Layanan",
    })
    .click();
  await expect(page.getByText("Disalin ke papan klip.")).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('fitur "Pencarian Layanan"');

  // Unduh ZIP: PRD.md dan satu berkas per fitur.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Unduh ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^aplikasi-antre-potong-rambut[a-z0-9-]*\.zip$/,
  );
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const names = Object.keys(files);
  expect(names).toHaveLength(8);
  expect(names[0]).toBe("PRD.md");
  expect(names[1]).toBe("features/01-pencarian-layanan.md");
  const first = strFromU8(files[names[1] ?? ""] ?? new Uint8Array());
  expect(first).toContain("# Pencarian Layanan");
  expect(first).toContain("## Task\n\n### 1. Buat model data dan API Pencarian Layanan");
});

test("susun ulang task satu fitur mengganti task fitur itu saja", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/tasks`);
  const feature = page.getByRole("region", { name: "Pemesanan" });
  await expect(
    feature.getByRole("heading", { level: 3, name: "Task (3)" }),
  ).toBeVisible();
  await feature.getByRole("button", { name: "Susun ulang task" }).click();
  await expect(feature.getByRole("heading", { level: 3, name: "Task (3)" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/7\/7 fitur lengkap · 21 task$/)).toBeVisible();
});

test("kanban: seret antarkolom, menu status, status massal, dan reset bertahan setelah muat ulang", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/kanban`);
  const column = (name: string) => page.getByRole("region", { name });
  await expect(column("Todo").getByText("21 task")).toBeVisible();

  // Seret dan lepas satu kartu ke "Dikerjakan".
  const card = column("Todo").locator("li").first();
  const title = (await card.locator("p").first().textContent()) ?? "";
  // Seret dari area judul (bukan dari menu status). Diulang sampai handler drop terpasang:
  // seretan sebelum hidrasi React tidak berpengaruh.
  await expect(async () => {
    if ((await column("Dikerjakan").getByText(title, { exact: true }).count()) === 0) {
      await card.dragTo(column("Dikerjakan"), { sourcePosition: { x: 60, y: 14 } });
    }
    await expect(column("Dikerjakan").getByText(title, { exact: true })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 10_000 });

  // Menu status per kartu (alternatif papan ketik/ponsel).
  await column("Dikerjakan").getByLabel(`Pindahkan "${title}" ke`).selectOption("done");
  await expect(column("Selesai").getByText(title, { exact: true })).toBeVisible();

  // Status massal: pilih dua kartu lalu pindahkan ke Selesai.
  const todoCards = column("Todo").getByRole("checkbox");
  await todoCards.nth(0).check();
  await todoCards.nth(1).check();
  await expect(page.getByText("2 task dipilih")).toBeVisible();
  await page.getByRole("button", { name: "Pindahkan", exact: true }).click();
  await expect(page.getByText("2 task dipindahkan.")).toBeVisible();
  await expect(column("Selesai").getByText("3 task")).toBeVisible();

  await page.reload();
  await expect(column("Selesai").getByText("3 task")).toBeVisible();
  await expect(page.getByText("Kanban · 3 dari 21 task selesai")).toBeVisible();

  await page.getByRole("button", { name: "Reset status" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Semua task kembali ke Todo.")).toBeVisible();
  await page.reload();
  await expect(column("Todo").getByText("21 task")).toBeVisible();
});

test("tab plan berpindah antarbagian dan menandai halaman aktif", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/kanban`);
  const nav = page.getByRole("navigation", { name: "Bagian plan" });
  await expect(nav.getByRole("link", { name: "Kanban" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "Spesifikasi & task" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await nav.getByRole("link", { name: "PRD" }).click();
  await expect(page).toHaveURL(/\/prd$/);
  await nav.getByRole("link", { name: "Struktur" }).click();
  await expect(page).toHaveURL(/step=4$/);
});

test("kerangka tab plan tidak bergeser: bilah tab dan judul di posisi sama di kelima tab", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/plans/${planId}?step=4`);
  const nav = page.getByRole("navigation", { name: "Bagian plan" });
  const title = page.getByRole("heading", { level: 1 });

  async function frame() {
    const [navBox, titleBox] = await Promise.all([
      nav.boundingBox(),
      title.boundingBox(),
    ]);
    return {
      nav: navBox,
      title: titleBox && { x: titleBox.x, y: titleBox.y, width: titleBox.width },
    };
  }

  await expect(nav.getByRole("link", { name: "Struktur" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const expected = await frame();
  // Lewat klik tab (navigasi klien): layout bersama tidak dirender ulang, tab aktif tetap harus ikut.
  for (const [tab, url] of [
    ["PRD", /\/prd$/],
    ["Spesifikasi & task", /\/tasks$/],
    ["Kanban", /\/kanban$/],
    ["Pemakaian", /\/usage$/],
    ["Struktur", /step=4$/],
  ] as const) {
    await nav.getByRole("link", { name: tab }).click();
    await expect(page).toHaveURL(url);
    await expect(nav.getByRole("link", { name: tab })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(title).toHaveCount(1);
    expect(await frame(), tab).toEqual(expected);
  }
});

test("tab Pemakaian menampilkan token dan biaya per run plan", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/tasks`);
  await page
    .getByRole("navigation", { name: "Bagian plan" })
    .getByRole("link", { name: "Pemakaian" })
    .click();
  await expect(page).toHaveURL(/\/usage$/);
  await expect(page.getByText(/^Pemakaian AI · \d+ panggilan model$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Batas biaya" })).toBeVisible();

  // Satu run per job: build spesifikasi + task digabung; pertanyaan wizard berdiri sendiri.
  const runs = page.getByRole("region", { name: "Riwayat run" }).getByRole("listitem");
  for (const label of ["Pertanyaan wizard", "Roadmap", "PRD", "Spesifikasi + Task"]) {
    await expect(runs.filter({ hasText: label }).first()).toBeVisible();
  }
  // Mode mock tidak berbayar; token tetap diperkirakan.
  await expect(runs.first()).toContainText("US$0,00");
  await expect(runs.first()).toContainText(/\d+ masuk · \d+ keluar/);
});

test("task: ubah di tempat, salin semua prompt, hapus dengan Urungkan", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  await page.goto(`/plans/${planId}/tasks`);
  const feature = page.getByRole("region", { name: "Pemesanan" });
  await expect(
    feature.getByRole("heading", { level: 3, name: "Task (3)" }),
  ).toBeVisible();

  await feature
    .getByRole("button", { name: /^Ubah task / })
    .first()
    .click();
  await feature.getByLabel("Judul", { exact: true }).fill("Task diubah uji");
  await feature.getByLabel("Prompt", { exact: true }).fill("Prompt diubah untuk uji.");
  await feature.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Task disimpan.")).toBeVisible();
  await page.reload();
  await expect(feature.getByText("Task diubah uji")).toBeVisible();

  await feature
    .getByRole("button", { name: "Salin semua prompt fitur Pemesanan" })
    .click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("## 1. Task diubah uji\n\nPrompt diubah untuk uji.");
  expect(copied.match(/^## \d+\. /gm)).toHaveLength(3);

  await feature.getByRole("button", { name: "Hapus task Task diubah uji" }).click();
  await expect(feature.getByText("Task diubah uji")).toHaveCount(0);
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(feature.getByText("Task diubah uji")).toBeVisible();

  await feature.getByRole("button", { name: "Hapus task Task diubah uji" }).click();
  await expect(
    feature.getByRole("heading", { level: 3, name: "Task (2)" }),
  ).toBeVisible();
  // DELETE baru terkirim setelah jendela Urungkan (8 detik) habis; setelah itu tetap hilang saat dimuat ulang.
  await page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      response.url().includes("/api/plan/tasks/"),
    { timeout: 15_000 },
  );
  await page.reload();
  await expect(
    feature.getByRole("heading", { level: 3, name: "Task (2)" }),
  ).toBeVisible();
});

test("command palette: Ctrl+K, cari, Enter berpindah; tombol Cari dan Esc", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/prd`);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Cari dan perintah" });
  await expect(palette).toBeVisible();
  const input = palette.getByRole("combobox");
  await expect(input).toBeFocused();
  // Bagian plan yang sedang dibuka ada di atas.
  await expect(palette.getByRole("option", { name: "Buka kanban" })).toBeVisible();
  await input.fill("kanban");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/kanban$/);
  await expect(palette).toBeHidden();

  await page.getByRole("button", { name: "Cari dan perintah" }).first().click();
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("pengaturan");
  await palette.getByRole("combobox").press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill("unduh zip");
  const download = page.waitForEvent("download");
  await palette.getByRole("combobox").press("Enter");
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});

test("endpoint task dan SSE menolak permintaan tanpa sesi", async ({ request }) => {
  for (const path of [
    `/api/plan/tasks/list?planId=${planId}`,
    `/api/plan/generation/status?planId=${planId}`,
    `/api/plan/generation/stream?planId=${planId}`,
    `/api/plan/export?planId=${planId}&format=zip`,
  ]) {
    expect((await request.get(path)).status()).toBe(401);
  }
});
