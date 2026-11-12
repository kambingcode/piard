import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

// Akun pemilik dibuat oleh auth.desktop.spec.ts (berkas ini berjalan sesudahnya).
test.describe.configure({ mode: "serial" });

const IDEA = "Aplikasi reservasi lapangan futsal untuk komunitas kampus.";
let planId = "";

async function poll(
  page: Page,
  path: string,
  pick: (json: Record<string, unknown>) => unknown,
) {
  return expect.poll(async () => pick(await (await page.request.get(path)).json()), {
    timeout: 30_000,
  });
}

/** Plan dengan roadmap, PRD versi 1, serta spesifikasi & task lengkap (LLM mock). */
async function readyPlan(page: Page): Promise<string> {
  const created = await (
    await page.request.post("/api/plan/create", { data: { idea: IDEA } })
  ).json();
  const id: string = created.plan.id;
  await page.request.post("/api/plan/questions", { data: { planId: id } });
  await page.request.patch(`/api/plan/${id}`, { data: { step: 4 } });
  await page.request.post("/api/plan/roadmap/generate", { data: { planId: id } });
  await (
    await poll(page, `/api/plan/roadmap/generate?planId=${id}`, (j) => j.status)
  ).toBe("ready");
  await page.request.post("/api/plan/generate", { data: { planId: id } });
  await (await poll(page, `/api/plan/generate?planId=${id}`, (j) => j.status)).toBe(
    "ready",
  );
  await page.request.post("/api/plan/generation/start", { data: { planId: id } });
  await (
    await poll(page, `/api/plan/generation/status?planId=${id}`, (j) => j.status)
  ).toBe("ready");
  return id;
}

test("chat revisi: tanya jawab, revisi PRD menjadi versi 2, usulan fitur diterima", async ({
  page,
}) => {
  await signIn(page);
  planId = await readyPlan(page);
  await page.goto(`/plans/${planId}/prd`);

  const panel = page.getByRole("region", { name: "Chat revisi" });
  await expect(panel.getByText("PRD kamu sudah jadi.", { exact: false })).toBeVisible();

  // Saran pertama langsung dikirim; balasan biasa tanpa tindakan.
  await panel
    .getByRole("button", { name: "Apa risiko terbesar dari rencana ini?" })
    .click();
  await expect(panel.getByText(/Risiko utamanya ada di adopsi awal/)).toBeVisible();

  const input = panel.getByLabel("Pesan untuk AI");
  await input.fill("Tambahkan fitur notifikasi pengingat jadwal");
  await input.press("Enter");

  await expect(panel.getByText("PRD berhasil diupdate (versi 2)")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/^Versi 2 · disimpan /)).toBeVisible();
  const doc = page.getByRole("article", { name: "Dokumen PRD" });
  await expect(
    doc.getByText("Tambahkan fitur notifikasi pengingat jadwal"),
  ).toBeVisible();

  const proposal = panel.getByRole("region", { name: "Usulan perubahan fitur" });
  await expect(proposal.getByText("Ditambah")).toBeVisible();
  await expect(proposal.getByText("Notifikasi Pengingat", { exact: true })).toBeVisible();
  await proposal.getByRole("button", { name: "Terima" }).click();
  await expect(proposal.getByText("Diterima")).toBeVisible();
  await expect(proposal.getByRole("button", { name: "Terima" })).toHaveCount(0);

  // PRD berubah dan satu fitur basi.
  await expect(
    panel.getByRole("heading", { name: "PRD berubah (versi 2)" }),
  ).toBeVisible();
  await expect(panel.getByText(/^1 fitur berubah\./)).toBeVisible();

  // Riwayat tersimpan setelah muat ulang.
  await page.reload();
  await expect(panel.getByText("PRD berhasil diupdate (versi 2)")).toBeVisible();
  await expect(proposal.getByText("Diterima")).toBeVisible();
});

test("sesuaikan fitur dengan PRD: usulan penyesuaian ditolak, tanda PRD berubah hilang", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/prd`);
  const panel = page.getByRole("region", { name: "Chat revisi" });
  await panel.getByRole("button", { name: "Sesuaikan fitur dengan PRD" }).click();

  // PRD mock tidak menyebut fitur baru di Fitur Inti, jadi penyesuaian mengusulkan menghapusnya.
  const sync = panel.getByRole("region", { name: "Penyesuaian fitur dengan PRD" });
  await expect(sync.getByText("Dihapus")).toBeVisible({ timeout: 20_000 });
  await sync.getByRole("button", { name: "Tolak" }).click();
  await expect(page.getByText("Usulan ditolak. Roadmap tidak berubah.")).toBeVisible();
  await expect(panel.getByRole("heading", { name: /^PRD berubah/ })).toHaveCount(0);
});

test("halaman task: fitur yang berubah disesuaikan ulang", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}/tasks`);
  await expect(page.getByText("1 fitur berubah sejak task-nya dibuat")).toBeVisible();
  // Fitur baru belum punya spesifikasi, jadi tandanya "Belum disusun" (lebih kuat dari "Berubah").
  const card = page.getByRole("region", { name: "Notifikasi Pengingat" });
  await expect(card.getByText("Belum disusun", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sesuaikan task" }).click();
  await expect(page.getByText("1 fitur berubah sejak task-nya dibuat")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(card.getByText("Belum disusun", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("heading", { name: "Task (3)" })).toBeVisible();
  await expect(
    page.getByText(/^Spesifikasi & task · 8\/8 fitur lengkap · 24 task$/),
  ).toBeVisible();
});
