import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import Database from "better-sqlite3";
import { unzipSync } from "fflate";
import { projectZip, uploadAndAnalyze } from "./codebase-helpers";
import { expect, OWNER, signIn, test } from "./fixtures";

/**
 * Keadaan proyek eksisting yang tidak dilalui alur utama `codebase.desktop.spec.ts`: status kosong,
 * tautan dari form ide, analisis gagal (Coba lagi / Batalkan), draf editor, panel samping, unduh ZIP
 * dari tombol, dan token agen baru. Berkas ini berjalan sebelum `codebase.desktop.spec.ts` (urutan
 * nama), saat akun pemilik belum punya proyek; setiap tes menghapus proyeknya sendiri.
 */
test.describe.configure({ mode: "serial" });

/** Database e2e yang sama dengan `playwright.config.ts` (bukan database dev). */
const E2E_DB = join(tmpdir(), "piard-e2e", "e2e.db");

async function createProject(
  page: Page,
  name: string,
  source: "zip" | "agent" = "zip",
): Promise<string> {
  const res = await page.request.post("/api/codebase/create", {
    data: { name, source, language: "id" },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).codebase.id;
}

async function deleteProject(page: Page, id: string) {
  expect((await page.request.delete(`/api/codebase/${id}`)).status()).toBe(200);
}

/**
 * Menghabiskan anggaran bulanan: batas US$0,50 lewat API pengaturan dan satu baris pemakaian US$1
 * langsung di database e2e (mode mock selalu mencatat US$0). Mengembalikan fungsi pemulih.
 */
async function exhaustBudget(page: Page): Promise<() => Promise<void>> {
  const before = await (await page.request.get("/api/settings")).json();
  const models = Object.fromEntries(
    Object.entries(before.models as Record<string, { value: string }>).map(([k, v]) => [
      k,
      v.value,
    ]),
  );
  const put = (monthlyUsd: number | null, dailyUsd: number | null) =>
    page.request.put("/api/settings", {
      data: { models, budget: { dailyUsd, monthlyUsd } },
    });
  expect((await put(0.5, null)).status()).toBe(200);

  const usageId = randomUUID();
  const db = new Database(E2E_DB);
  try {
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(OWNER.email) as {
      id: string;
    };
    db.prepare(
      `INSERT INTO usage (id, user_id, kind, model, input_tokens, output_tokens, cost_usd, created_at)
       VALUES (?, ?, 'roadmap', 'uji', 0, 0, 1, ?)`,
    ).run(usageId, user.id, Date.now());
  } finally {
    db.close();
  }

  return async () => {
    const db = new Database(E2E_DB);
    try {
      db.prepare("DELETE FROM usage WHERE id = ?").run(usageId);
    } finally {
      db.close();
    }
    const overridden =
      Object.values(before.models as Record<string, { overridden: boolean }>).some(
        (m) => m.overridden,
      ) ||
      before.budget.monthlyUsd.overridden ||
      before.budget.dailyUsd.overridden;
    const restored = overridden
      ? await put(before.budget.monthlyUsd.value, before.budget.dailyUsd.value)
      : await page.request.delete("/api/settings");
    expect(restored.status()).toBe(200);
  };
}

async function uploadProject(page: Page, name: string): Promise<string> {
  const id = await createProject(page, name);
  const uploaded = await page.request.post(`/api/codebase/${id}/upload`, {
    data: projectZip(),
    headers: { "content-type": "application/zip", "x-file-name": "toko.zip" },
  });
  expect(uploaded.status()).toBe(200);
  return id;
}

const CRASHED = "Proses terhenti berulang kali saat menjalankan pekerjaan ini.";

/**
 * Analisis yang mati di tengah jalan (mis. server dimulai ulang tiga kali saat menyusun halaman). Mode
 * mock tidak pernah gagal sendiri, jadi job gagal ditulis langsung di database e2e; status proyek
 * masih `analyzing` sehingga halaman harus menyamakannya sendiri (`reconcile`).
 */
async function crashedAnalysis(page: Page, name: string): Promise<string> {
  const id = await uploadProject(page, name);
  const db = new Database(E2E_DB);
  try {
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(OWNER.email) as {
      id: string;
    };
    const jobId = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO jobs (id, kind, state, payload, progress, error, attempts, created_at, updated_at)
       VALUES (?, 'codebase-analyze', 'failed', ?, ?, ?, 3, ?, ?)`,
    ).run(
      jobId,
      JSON.stringify({ userId: user.id, codebaseId: id }),
      JSON.stringify({ phase: "summarize", done: 0, total: 1 }),
      CRASHED,
      now,
      now,
    );
    db.prepare(
      "UPDATE codebases SET status = 'analyzing', analysis_job_id = ? WHERE id = ?",
    ).run(jobId, id);
  } finally {
    db.close();
  }
  return id;
}

test("status kosong /codebases mengajak memulai; tautan di form ide membuka alur proyek eksisting", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/codebases");
  await expect(page.getByText("Belum ada proyek eksisting")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Tambah proyek" }).click();
  await expect(page).toHaveURL(/\/plan\?flow=existing$/);

  await page.goto("/plan?flow=new");
  await page.getByRole("link", { name: "Analisis codebase Anda" }).click();
  await expect(page).toHaveURL(/\/plan\?flow=existing$/);
  await expect(
    page.getByRole("heading", { name: "Analisis proyek eksisting" }),
  ).toBeVisible();
});

test("anggaran habis: Mulai analisis menolak dengan pesan batas biaya, bukan galat server", async ({
  page,
}) => {
  await signIn(page);
  const id = await uploadProject(page, "Proyek Hemat");
  const restore = await exhaustBudget(page);
  try {
    await page.goto(`/codebases/${id}`);
    await page.getByRole("button", { name: "Mulai analisis" }).click();
    // Mock memperkirakan US$0, jadi tanpa dialog konfirmasi; penolakan datang dari antrean job.
    await expect(
      page.getByText(/Batas biaya AI bulanan \(US\$0,50\) sudah tercapai/),
    ).toBeVisible();
    await expect(page.getByText("Terjadi kesalahan di server")).toHaveCount(0);
    const status = await (await page.request.get(`/api/codebase/${id}/status`)).json();
    expect(status).toMatchObject({ status: "source_ready", job: null });
  } finally {
    await restore();
  }
  await deleteProject(page, id);
});

test("analisis gagal: langkah gagal dan pesan tampil, Coba lagi melanjutkan sampai selesai", async ({
  page,
}) => {
  await signIn(page);
  const id = await crashedAnalysis(page, "Proyek Gagal");
  await page.goto(`/codebases/${id}`);
  const alert = page.getByRole("alert").filter({ hasText: "Analisis gagal" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(CRASHED);
  await expect(page.getByRole("button", { name: "Batalkan" })).toBeVisible();

  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Ringkasan" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(alert).toHaveCount(0);
  await expect(page.getByText("10 halaman baru")).toBeVisible();
  await deleteProject(page, id);
});

test("analisis gagal: Batalkan menghapus sumber dan kembali meminta sumber", async ({
  page,
}) => {
  await signIn(page);
  const id = await crashedAnalysis(page, "Proyek Batal");
  await page.goto(`/codebases/${id}`);
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect(
    page.getByText("Analisis dibatalkan. Sumber sementara sudah dihapus."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Unggah" })).toBeVisible();
  const status = await (await page.request.get(`/api/codebase/${id}/status`)).json();
  expect(status.status).toBe("awaiting_source");
  // Sumber sudah dihapus: "Coba lagi" tidak mungkin lagi.
  expect((await page.request.post(`/api/codebase/${id}/analyze/retry`)).status()).toBe(
    409,
  );
  await deleteProject(page, id);
});

test("panel samping: asal halaman dan berkas dipotong; Unduh semua (.zip)", async ({
  page,
}) => {
  await signIn(page);
  const id = await createProject(page, "Proyek Besar");
  await uploadAndAnalyze(
    page,
    id,
    projectZip({ "src/besar.ts": "export const nilai = 1;\n".repeat(2_000) }),
  );
  await page.goto(`/codebases/${id}`);
  const info = page.getByRole("complementary", { name: "Tentang proyek" });
  await expect(info.getByText("Asal halaman")).toBeVisible();
  await expect(info.getByText("AI 10")).toBeVisible();
  await expect(info.getByText(/1 berkas dipotong agar muat anggaran/)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Unduh semua (.zip)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("proyek-besar-docs.zip");
  const names = Object.keys(unzipSync(new Uint8Array(await readFile(await file.path()))));
  expect(names).toContain("01-ringkasan.md");
  expect(names).toContain("10-catatan.md");
  await deleteProject(page, id);
});

test("editor: draf dipulihkan setelah muat ulang, simpan gagal tidak membuang teks", async ({
  page,
}) => {
  await signIn(page);
  const id = await createProject(page, "Proyek Draf");
  await uploadAndAnalyze(page, id, projectZip());
  await page.goto(`/codebases/${id}?page=ringkasan`);
  await page.getByRole("button", { name: "Ubah" }).click();
  const editor = page.getByLabel("Isi halaman (Markdown)");
  await editor.fill("Draf yang belum disimpan.");

  // Perubahan belum tersimpan: browser memperingatkan sebelum halaman ditinggalkan.
  const dialog = new Promise<string>((resolve) =>
    page.once("dialog", (d) => {
      resolve(d.type());
      void d.accept();
    }),
  );
  await page.reload();
  expect(await dialog).toBe("beforeunload");

  await page.getByRole("button", { name: "Ubah" }).click();
  await expect(page.getByText("Draf yang belum tersimpan dipulihkan.")).toBeVisible();
  await expect(editor).toHaveValue("Draf yang belum disimpan.");

  // Simpan gagal (mis. analisis mulai di tab lain): pesan tampil, teks tetap ada.
  await page.route(`**/api/codebase/${id}/docs`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Dokumentasi sedang diperbarui analisis.",
            code: "CONFLICT",
          }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Dokumentasi sedang diperbarui analisis.")).toBeVisible();
  await expect(editor).toHaveValue("Draf yang belum disimpan.");

  await page.unroute(`**/api/codebase/${id}/docs`);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(/^Versi 2 · manual · /)).toBeVisible();
  // Draf dibersihkan setelah tersimpan: membuka editor lagi tidak memulihkan apa pun.
  await page.reload();
  await page.getByRole("button", { name: "Ubah" }).click();
  await expect(page.getByText("Draf yang belum tersimpan dipulihkan.")).toHaveCount(0);
  await deleteProject(page, id);
});

test("agen: Salin prompt menyalin prompt bertoken; Buat token baru mematikan token lama", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  const id = await createProject(page, "Proyek Token", "agent");
  await page.goto(`/codebases/${id}`);
  await expect(page.getByRole("button", { name: "Salin prompt" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buat token", exact: true }).click();
  await page.getByRole("button", { name: "Salin prompt" }).click();
  await expect(page.getByText("Disalin ke papan klip.")).toBeVisible();
  const first = await page.evaluate(() => navigator.clipboard.readText());
  const oldToken = /Bearer (pcb_[A-Za-z0-9_-]{43})/.exec(first)?.[1] ?? "";
  expect(oldToken).not.toBe("");

  // Setelah muat ulang token mentah tidak ada lagi; yang tersedia "Buat token baru".
  await page.reload();
  await expect(page.getByText(/^Token aktif sampai /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salin prompt" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buat token baru" }).click();
  await page.getByRole("button", { name: "Salin prompt" }).click();
  const second = await page.evaluate(() => navigator.clipboard.readText());
  const newToken = /Bearer (pcb_[A-Za-z0-9_-]{43})/.exec(second)?.[1] ?? "";
  expect(newToken).not.toBe(oldToken);

  const submit = (token: string) =>
    page.request.post("/api/codebase/agent/submit", {
      headers: { authorization: `Bearer ${token}` },
      data: { pages: [{ slug: "ringkasan", content: "Dari agen." }] },
    });
  expect((await submit(oldToken)).status()).toBe(401);
  expect((await submit(newToken)).status()).toBe(200);
  await deleteProject(page, id);
});
