import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { projectZip } from "./codebase-helpers";
import { expect, signIn, test } from "./fixtures";

// Akun pemilik dibuat oleh auth.desktop.spec.ts (berkas ini berjalan sesudahnya).
test.describe.configure({ mode: "serial" });

const PROJECT = "Toko Daring";

let projectUrl = "";
/** Plan fitur baru yang dibuat dari proyek ZIP; harus selamat saat proyeknya dihapus. */
let planPath = "";

test("ZIP: unggah, perkiraan biaya, analisis (mock), baca dokumentasi dan diagram", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Analisis codebase" }).click();
  await expect(page).toHaveURL(/\/plan\?flow=existing$/);
  await expect(
    page.getByRole("heading", { name: "Analisis proyek eksisting" }),
  ).toBeVisible();

  await page.getByLabel("Nama proyek").fill(PROJECT);
  await page.getByText("Upload ZIP", { exact: true }).click();
  // Tanpa berkas: galat di bawah kolomnya, tidak ada proyek yang dibuat.
  await page.getByRole("button", { name: "Unggah" }).click();
  await expect(page.getByText("Pilih berkas .zip dulu.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "toko.zip",
    mimeType: "application/zip",
    buffer: projectZip(),
  });
  await page.getByRole("button", { name: "Unggah" }).click();
  await expect(page).toHaveURL(/\/codebases\/[0-9a-f-]{36}$/);
  projectUrl = page.url();

  await expect(page.getByRole("heading", { level: 1, name: PROJECT })).toBeVisible();
  await expect(page.getByText("Perkiraan biaya analisis")).toBeVisible();
  await expect(page.getByText(/nilai rahasia disembunyikan/)).toBeVisible();
  await page.getByRole("button", { name: "Mulai analisis" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Ringkasan" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("10 halaman baru")).toBeVisible();
  await expect(page.getByText(/^Versi 1 · AI · /)).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Halaman dokumentasi" });
  await nav.getByRole("link", { name: "Arsitektur" }).click();
  await expect(page).toHaveURL(/\?page=arsitektur$/);
  await expect(page.getByRole("heading", { level: 2, name: "Arsitektur" })).toBeVisible();
  await expect(page.locator("svg[id^='mermaid']").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(nav.getByRole("link", { name: "Arsitektur" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("edit manual menjadi versi baru; riwayat; pulihkan versi lama", async ({ page }) => {
  await signIn(page);
  await page.goto(`${projectUrl}?page=ringkasan`);
  await page.getByRole("button", { name: "Ubah" }).click();
  await page.getByLabel("Isi halaman (Markdown)").fill("Toko Daring ditulis tangan.");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(/^Versi 2 · manual · /)).toBeVisible();
  await expect(page.getByText("Toko Daring ditulis tangan.")).toBeVisible();

  await page.getByLabel("Riwayat versi").selectOption("1");
  await expect(page.getByText("Melihat versi 1 (lama).")).toBeVisible();
  await page.getByRole("button", { name: "Pulihkan versi ini" }).click();
  await expect(page.getByText(/^Versi 3 · manual · /)).toBeVisible();
  await expect(page.getByText("Toko Daring ditulis tangan.")).toHaveCount(0);

  // Halaman yang belum ada tidak terjadi di mock; unduh .md halaman aktif.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh .md" }).click();
  expect((await download).suggestedFilename()).toBe("toko-daring-ringkasan.md");
});

test("analisis ulang: halaman yang diedit menerima usulan; bandingkan lalu terima", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(projectUrl);
  await page.getByText("Analisis ulang", { exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "toko-v2.zip",
    mimeType: "application/zip",
    buffer: projectZip({ "src/features/wishlist/service.ts": "export const w = 1" }),
  });
  await page.getByRole("button", { name: "Unggah" }).click();
  await page.getByRole("button", { name: "Mulai analisis" }).click();
  await expect(page.getByText(/usulan untuk halaman yang Anda edit/)).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(`${projectUrl}?page=ringkasan`);
  await expect(page.getByText("Ada usulan dari analisis ulang")).toBeVisible();
  await page.getByRole("button", { name: "Bandingkan" }).click();
  await expect(page.getByText("Versi Anda (v3)")).toBeVisible();
  await expect(page.getByText("Usulan (AI)")).toBeVisible();
  await page.getByRole("button", { name: "Terima usulan" }).click();
  await expect(page.getByText(/^Versi 4 · AI · /)).toBeVisible();
  await expect(page.getByText("Ada usulan dari analisis ulang")).toHaveCount(0);
});

test("rencanakan fitur baru: teknologi terkunci dari proyek, sampai ZIP berisi codebase/", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(projectUrl);
  await page.getByRole("link", { name: "Rencanakan fitur baru" }).click();
  await expect(page.getByRole("heading", { name: "Mau menambah apa?" })).toBeVisible();
  await page
    .getByLabel("Fitur yang ingin ditambahkan")
    .fill("Wishlist produk dengan notifikasi harga.");
  await page.getByRole("button", { name: "Buat rencana" }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}\?step=2$/);
  planPath = new URL(page.url()).pathname;

  await expect(page.getByText(`Teknologi dari proyek ${PROJECT}`)).toBeVisible();
  // Nama proyek juga ada di sidebar; yang diuji adalah tautan di halaman plan.
  await expect(
    page.getByRole("main").getByRole("link", { name: PROJECT }),
  ).toHaveAttribute("href", new URL(projectUrl).pathname);
  await expect(page.getByLabel("Frontend")).toBeDisabled();
  await expect(page.getByLabel("Frontend")).toHaveValue("Next.js");
  // Buka kunci butuh konfirmasi.
  await page.getByRole("button", { name: "Buka kunci" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Buka kunci" }).click();
  await expect(page.getByLabel("Frontend")).toBeEnabled();

  await page.getByRole("button", { name: "Lanjut ke pertanyaan" }).click();
  await expect(page.getByText("Pertanyaan 1 dari 5")).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Lewati" }).click();
  await page.getByRole("link", { name: "Lanjutkan ke PRD" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/prd$/);
  await page.getByRole("link", { name: "Lanjutkan ke spesifikasi & task" }).click({
    timeout: 20_000,
  });
  await expect(page.getByText(/fitur lengkap/)).toBeVisible({ timeout: 30_000 });

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Unduh ZIP" }).click();
  const files = unzipSync(new Uint8Array(await readFile(await (await download).path())));
  const names = Object.keys(files);
  expect(names[0]).toBe("PRD.md");
  expect(names).toContain("codebase/01-ringkasan.md");
  expect(names).toContain("codebase/04-arsitektur.md");
});

test("agen: token sekali tampil, skrip kirim dari prompt (curl) mengisi dokumentasi", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/plan?flow=existing");
  await page.getByLabel("Nama proyek").fill("Proyek Agen");
  await page.getByRole("button", { name: "Buat dan lihat prompt" }).click();
  await expect(
    page.getByRole("heading", { name: "Menunggu hasil dari agen" }),
  ).toBeVisible();
  await expect(
    page.getByText(/hanya bisa dijangkau dari komputer yang sama/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Buat token" }).click();
  await expect(page.getByText("Token ini hanya ditampilkan sekali")).toBeVisible();

  await page.getByText("Lihat isi prompt").click();
  const prompt = await page.locator("details pre").innerText();
  expect(prompt).toMatch(/Authorization: Bearer pcb_[A-Za-z0-9_-]{43}/);
  const script = /```bash\n([\s\S]*?)\n```/.exec(prompt)?.[1] ?? "";

  // Simulasi Claude Code: tulis halaman ke folder sementara lalu jalankan skrip kirim apa adanya.
  const tmp = mkdtempSync(join(tmpdir(), "piard-e2e-agent-"));
  try {
    mkdirSync(join(tmp, "piard-docs"));
    writeFileSync(join(tmp, "piard-docs", "ringkasan.md"), "Proyek agen: toko daring.");
    writeFileSync(
      join(tmp, "piard-docs", "api.md"),
      "| Metode | Jalur |\n|---|---|\n| GET | /api/x |",
    );
    const run = spawnSync("bash", ["-c", script], {
      env: { ...process.env, TMPDIR: tmp },
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ added: ["ringkasan", "api"] });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // Halaman memeriksa berkala dan menampilkan dokumentasi tanpa dimuat ulang manual.
  await expect(page.getByRole("heading", { level: 2, name: "Ringkasan" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/^Versi 1 · agen · /)).toBeVisible();
});

test("GitHub: URL ke host lain ditolak di kolomnya tanpa membuat proyek", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/plan?flow=existing");
  await page.getByLabel("Nama proyek").fill("Repo Asing");
  await page.getByText("URL GitHub", { exact: true }).click();
  await page.getByLabel("URL repo GitHub").fill("http://localhost:3200/a/b");
  await page.getByRole("button", { name: "Ambil repo" }).click();
  await expect(page.getByText(/Ini bukan URL GitHub/)).toBeVisible();
  await expect(page.getByLabel("URL repo GitHub")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.goto("/codebases");
  await expect(page.getByRole("link", { name: "Repo Asing" })).toHaveCount(0);
});

test("daftar proyek dan sidebar; hapus dengan Urungkan, plan tertaut tetap ada", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/codebases");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: PROJECT })).toBeVisible();
  await expect(main.getByText("10/10 halaman")).toBeVisible();
  const sidebar = page.getByRole("region", { name: "Proyek eksisting" });
  await expect(sidebar.getByRole("link", { name: "Proyek Agen" })).toBeVisible();

  // Urungkan: proyek kembali.
  await main.getByRole("button", { name: "Hapus proyek Proyek Agen" }).click();
  await expect(main.getByRole("link", { name: "Proyek Agen" })).toHaveCount(0);
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(main.getByRole("link", { name: "Proyek Agen" })).toBeVisible();

  // Hapus sungguhan proyek ZIP: plan fitur barunya tetap ada, tanpa tautan proyek.
  const deleted = page.waitForResponse(
    (res) => res.request().method() === "DELETE" && /\/api\/codebase\//.test(res.url()),
    { timeout: 15_000 },
  );
  await main.getByRole("button", { name: `Hapus proyek ${PROJECT}` }).click();
  expect((await deleted).status()).toBe(200);
  await expect(
    page.getByText(
      "1 plan fitur baru dari proyek ini tetap ada, kini tanpa tautan ke proyek.",
    ),
  ).toBeVisible();
  await page.goto("/codebases");
  await expect(main.getByRole("link", { name: PROJECT })).toHaveCount(0);
  await page.goto(projectUrl);
  await expect(page.getByRole("heading", { name: /tidak ditemukan/i })).toBeVisible();

  // Plan tertaut masih terbuka, teknologinya tetap, dan tidak lagi menaut ke proyek yang terhapus.
  await page.goto(`${planPath}?step=2`);
  await expect(page.getByLabel("Frontend")).toHaveValue("Next.js");
  await expect(page.getByText(`Teknologi dari proyek ${PROJECT}`)).toHaveCount(0);
  await expect(main.getByRole("link", { name: PROJECT })).toHaveCount(0);
});
