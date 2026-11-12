import { request as playwrightRequest } from "@playwright/test";
import { agent, boardWithTasks } from "./agent-helpers";
import { expect, signIn, test } from "./fixtures";

/**
 * M8-15 (mode mock): Hubungkan AI → token → agen tersimulasi lewat HTTP (klaim, tanya, lapor) → papan
 * berubah langsung (SSE) → jawab, minta perbaikan, setujui. Agen memakai konteks permintaan tanpa
 * cookie, seperti server MCP.
 */
test.describe.configure({ mode: "serial" });

let planId = "";
let token = "";

test("hubungkan AI: token sekali tampil, cuplikan berisi token, instruksi proyek tersimpan", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  planId = await boardWithTasks(
    page,
    "Aplikasi catatan servis motor untuk bengkel kecil.",
  );
  await page.goto(`/plans/${planId}/kanban`);
  await expect(page.getByRole("region", { name: "Review" })).toBeVisible();

  await page.getByRole("button", { name: "Hubungkan AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Hubungkan AI ke kanban ini" });
  await expect(dialog.getByText("Belum ada token.")).toBeVisible();
  await dialog.getByLabel("Nama token").fill("Laptop uji");
  await dialog.getByLabel("Berlaku").selectOption("7");
  await dialog.getByRole("button", { name: "Buat token" }).click();
  await expect(
    dialog.getByText("Token hanya tampil sekali.", { exact: false }),
  ).toBeVisible();
  token = (await dialog.locator("pre code").first().textContent()) ?? "";
  expect(token).toMatch(/^ppl_[A-Za-z0-9_-]{43}$/);
  await expect(dialog.locator("pre code").nth(1)).toContainText(`PIARD_TOKEN=${token}`);
  await expect(dialog.locator("pre code").nth(1)).toContainText("mcp/server.ts");
  await dialog.getByRole("button", { name: "Salin perintah" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "claude mcp add --transport stdio piard",
  );
  await expect(
    dialog.getByRole("listitem").filter({ hasText: "Laptop uji" }),
  ).toContainText("Aktif");

  await dialog
    .getByRole("textbox", { name: "Instruksi proyek untuk agen" })
    .fill("Jalankan pnpm test sebelum melapor.");
  await dialog.getByRole("button", { name: "Simpan instruksi" }).click();
  await expect(page.getByText("Instruksi disimpan.")).toBeVisible();

  // Token tidak tampil lagi setelah dialog ditutup dan dibuka ulang.
  await dialog.getByRole("button", { name: "Tutup" }).click();
  await page.getByRole("button", { name: "Hubungkan AI" }).click();
  await expect(dialog.getByText(token)).toHaveCount(0);
  await expect(dialog.locator("pre code").first()).toContainText("PIARD_TOKEN='ppl_…'");
});

test("agen klaim → tanya → jawab → lapor → minta perbaikan → lapor → setujui, papan hidup", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.goto(`/plans/${planId}/kanban`);
  const column = (name: string) => page.getByRole("region", { name });
  await expect(column("Todo").getByText("21 task")).toBeVisible();

  const api = await playwrightRequest.newContext({ baseURL: page.url() });
  const bot = agent(api, token);
  const overview = await bot.plan();
  expect(overview.body.instructions).toBe("Jalankan pnpm test sebelum melapor.");
  const next = await bot.next();
  const id: string = next.body.task.id;
  const title: string = next.body.task.title;
  expect((await bot.claim(id)).status).toBe(200);

  // Papan berubah tanpa muat ulang: card pindah ke Dikerjakan dengan penanda AI.
  const card = () => page.locator(`li[data-task-id="${id}"]`);
  await expect(column("Dikerjakan").locator(`li[data-task-id="${id}"]`)).toBeVisible();
  await expect(card()).toContainText("AI · Laptop uji");

  await bot.note(
    id,
    "Riwayat servis disimpan per plat nomor atau per pelanggan?",
    "question",
  );
  await expect(card()).toContainText("AI butuh jawaban");
  await card()
    .getByRole("button", { name: `Detail dan catatan: ${title}` })
    .click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet.getByText("Riwayat servis disimpan per plat nomor")).toBeVisible();
  await sheet.getByLabel("Jawab pertanyaan AI").fill("Per plat nomor.");
  await sheet.getByRole("button", { name: "Kirim" }).click();
  await expect(page.getByText("Catatan terkirim.")).toBeVisible();
  await expect(sheet.getByText("Per plat nomor.")).toBeVisible();
  await sheet.getByRole("button", { name: "Tutup" }).click();
  await expect(card()).not.toContainText("AI butuh jawaban");
  expect(JSON.stringify((await bot.getTask(id)).body)).toContain("Per plat nomor.");

  expect(
    (await bot.report(id, "Model riwayat servis per plat nomor selesai.")).status,
  ).toBe(200);
  await expect(column("Review").locator(`li[data-task-id="${id}"]`)).toBeVisible();

  // Minta perbaikan dari card: lembar detail terbuka dengan fokus di kolom perbaikan.
  await card().getByRole("button", { name: "Minta perbaikan" }).click();
  await expect(
    sheet.getByText("Model riwayat servis per plat nomor selesai."),
  ).toBeVisible();
  await expect(sheet.getByLabel("Yang perlu diperbaiki")).toBeFocused();
  await sheet.getByLabel("Yang perlu diperbaiki").fill("Tambahkan pencarian plat nomor.");
  await sheet.getByRole("button", { name: "Minta perbaikan" }).click();
  await expect(
    page.getByText("Card kembali ke Todo dengan catatan perbaikan."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Tutup" }).click();
  await expect(column("Todo").locator(`li[data-task-id="${id}"]`)).toBeVisible();

  const again = await bot.next();
  expect(again.body.task.id).toBe(id);
  expect(JSON.stringify(again.body)).toContain("Tambahkan pencarian plat nomor.");
  await bot.claim(id);
  await bot.report(id, "Pencarian plat nomor ditambahkan.");
  await expect(column("Review").locator(`li[data-task-id="${id}"]`)).toBeVisible();
  await card()
    .getByRole("button", { name: `Setujui "${title}"` })
    .click();
  await expect(page.getByText("Card disetujui dan pindah ke Selesai.")).toBeVisible();
  await expect(column("Selesai").locator(`li[data-task-id="${id}"]`)).toBeVisible();

  // Linimasa lengkap bertahan setelah muat ulang.
  await page.reload();
  await card()
    .getByRole("button", { name: `Detail dan catatan: ${title}` })
    .click();
  await expect(sheet.getByText("Menyetujui card")).toBeVisible();
  await expect(sheet.getByText("Laporan").first()).toBeVisible();
  await api.dispose();
});

test("cabut semua token: agen langsung ditolak", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/kanban`);
  await page.getByRole("button", { name: "Hubungkan AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Hubungkan AI ke kanban ini" });
  await dialog.getByRole("button", { name: "Cabut semua" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cabut semua" })
    .click();
  await expect(page.getByText("1 token dicabut.")).toBeVisible();
  await expect(
    dialog.getByRole("listitem").filter({ hasText: "Laptop uji" }),
  ).toContainText("Dicabut");
  const api = await playwrightRequest.newContext({ baseURL: page.url() });
  expect((await agent(api, token).plan()).status).toBe(401);
  await api.dispose();
});
