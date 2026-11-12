import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

// Akun pemilik dibuat oleh auth.desktop.spec.ts (berkas ini berjalan sesudahnya).
test.describe.configure({ mode: "serial" });

const IDEA =
  "Aplikasi booking klinik untuk pasien dan dokter, dengan pengingat WhatsApp.";
let planId = "";

/** Plan baru yang sudah sampai langkah 4 (pertanyaan dibuat mock, jawaban dilewati). */
async function planAtRoadmap(page: Page): Promise<string> {
  const created = await (
    await page.request.post("/api/plan/create", { data: { idea: IDEA } })
  ).json();
  const id: string = created.plan.id;
  await page.request.post("/api/plan/questions", { data: { planId: id } });
  await page.request.patch(`/api/plan/${id}`, { data: { step: 4 } });
  return id;
}

const roadmap = async (page: Page) =>
  (await page.request.get(`/api/plan/roadmap/generate?planId=${planId}`)).json();

test("roadmap dibuat otomatis: progres berfasa, node muncul bertahap, lalu siap", async ({
  page,
}) => {
  await signIn(page);
  planId = await planAtRoadmap(page);
  await page.goto(`/plans/${planId}?step=4`);

  await expect(page.getByRole("heading", { name: "Menyusun roadmap" })).toBeVisible();
  await expect(page.getByText("Membaca ide dan jawaban Anda")).toBeVisible();

  // Jumlah fitur yang terbaca lewat polling naik bertahap, bukan langsung lengkap.
  const counts: number[] = [];
  await expect
    .poll(
      async () => {
        const state = await roadmap(page);
        counts.push(state.features.length);
        return state.status;
      },
      { intervals: [150], timeout: 20_000 },
    )
    .toBe("ready");
  expect(counts.some((n) => n > 0 && n < 7)).toBe(true);
  expect(counts).toEqual([...counts].sort((a, b) => a - b));

  await expect(page.getByRole("link", { name: "Lanjutkan ke PRD" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Menyusun roadmap" })).toBeHidden();
  const graph = page.getByRole("application", { name: "Graf roadmap" });
  await expect(graph.getByRole("button", { name: /^Buka detail / })).toHaveCount(7);
  await expect(graph.getByText("Fase 1").first()).toBeVisible();
  // Judul plan diambil dari roadmap dan tampil di kepala halaman.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Aplikasi booking");
});

test("ganti nama langsung di node, tersimpan setelah muat ulang", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}?step=4`);
  const node = page.getByRole("button", { name: "Buka detail Pencarian Layanan" });
  await node.hover();
  await page.getByRole("button", { name: "Ubah nama Pencarian Layanan" }).click();
  const input = page.getByRole("textbox", { name: "Ubah nama Pencarian Layanan" });
  await input.fill("Cari Dokter");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Buka detail Cari Dokter" }),
  ).toBeVisible();

  await expect
    .poll(async () => (await roadmap(page)).features[0]?.name)
    .toBe("Cari Dokter");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Buka detail Cari Dokter" }),
  ).toBeVisible();
});

test("Lihat semua membuka sub-fitur yang dilipat", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}?step=4`);
  const box = page.getByRole("list", { name: "Sub fitur Cari Dokter" });
  await expect(box.getByRole("listitem")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Lihat semua (4) sub-fitur Cari Dokter" })
    .click();
  await expect(box.getByRole("listitem")).toHaveCount(4);
  await expect(box.getByText("Simpan Favorit")).toBeVisible();
  await page.getByRole("button", { name: "Ringkas sub-fitur Cari Dokter" }).click();
  await expect(box.getByRole("listitem")).toHaveCount(3);
});

test("panel detail: ringkasan, fase, dan sub-fitur tersimpan otomatis", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/plans/${planId}?step=4`);
  await page.getByRole("button", { name: "Buka detail Cari Dokter" }).click();
  const panel = page.getByRole("dialog", { name: "Detail fitur" });
  await expect(panel).toBeVisible();

  await panel
    .getByLabel("Ringkasan", { exact: true })
    .fill("Pasien menemukan dokter yang pas.");
  await panel.getByLabel("Fase").selectOption("2");
  await expect(panel.getByText("Tersimpan").first()).toBeVisible();

  // Nama kosong tidak dikirim dan diberi tahu.
  await panel.getByLabel("Nama fitur").fill("   ");
  await expect(panel.getByText("Nama tidak boleh kosong.")).toBeVisible();
  await panel.getByLabel("Nama fitur").fill("Cari Dokter");

  await panel.getByRole("button", { name: "Tambah sub-fitur" }).click();
  const newSub = panel.getByRole("textbox", { name: "Nama sub-fitur" }).last();
  await expect(newSub).toHaveValue("Sub-fitur baru");
  await newSub.fill("Dokter Terdekat");
  await expect(panel.getByText("Tersimpan").last()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await expect
    .poll(async () => {
      const state = await roadmap(page);
      const feature = state.features.find(
        (f: { name: string }) => f.name === "Cari Dokter",
      );
      const subs = state.subFeatures.filter(
        (s: { parentId: string }) => s.parentId === feature?.id,
      );
      return {
        summary: feature?.summary,
        phase: feature?.phase,
        subs: subs.map((s: { name: string }) => s.name).at(-1),
        subPhase: subs[0]?.phase,
      };
    })
    .toEqual({
      summary: "Pasien menemukan dokter yang pas.",
      phase: 2,
      subs: "Dokter Terdekat",
      subPhase: 2,
    });
});

test("tambah fitur sendiri, lalu hapus dengan Undo", async ({ page }) => {
  await page.clock.install();
  await signIn(page);
  await page.goto(`/plans/${planId}?step=4`);
  await page.getByRole("button", { name: "Tambah fitur" }).click();
  const panel = page.getByRole("dialog", { name: "Detail fitur" });
  await expect(panel.getByLabel("Nama fitur")).toHaveValue("Fitur baru");
  await expect(panel.getByText("Ditambahkan Anda")).toBeVisible();
  await panel.getByLabel("Nama fitur").fill("Program Loyalitas");
  await expect(panel.getByText("Tersimpan").first()).toBeVisible();

  // Hapus → Urungkan: fitur kembali, tidak ada DELETE.
  await panel.getByRole("button", { name: "Hapus fitur" }).click();
  const node = page.getByRole("button", { name: "Buka detail Program Loyalitas" });
  await expect(node).toBeHidden();
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(node).toBeVisible();
  await page.clock.fastForward(10_000);
  expect((await roadmap(page)).features).toHaveLength(8);

  // Hapus tanpa Urungkan: terhapus setelah jendela habis.
  await node.click();
  await panel.getByRole("button", { name: "Hapus fitur" }).click();
  await expect(node).toBeHidden();
  await page.clock.fastForward(9_000);
  await expect.poll(async () => (await roadmap(page)).features.length).toBe(7);
});

test("tampilan daftar per fase sebagai alternatif graf", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}?step=4`);
  await page.getByRole("radio", { name: "Daftar" }).check({ force: true });
  const list = page.getByRole("region", { name: "Daftar fitur roadmap" });
  await expect(list.getByRole("heading", { name: "Fase 1" })).toBeVisible();
  await expect(list.getByRole("button", { name: /Cari Dokter/ })).toBeVisible();
  await expect(page.getByRole("application", { name: "Graf roadmap" })).toHaveCount(0);
});

test("buat ulang meminta konfirmasi lalu mengganti seluruh roadmap", async ({ page }) => {
  await signIn(page);
  await page.goto(`/plans/${planId}?step=4`);
  await page.getByRole("button", { name: "Buat ulang" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Buat ulang roadmap?" });
  await dialog.getByRole("button", { name: "Batal" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Buka detail Cari Dokter" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Buat ulang" }).click();
  await dialog.getByRole("button", { name: "Buat ulang" }).click();
  await expect(page.getByRole("heading", { name: "Menyusun roadmap" })).toBeVisible();
  // Selama job berjalan pengeditan dimatikan.
  await expect(page.getByRole("button", { name: "Tambah fitur" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Lanjutkan ke PRD" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Buka detail Cari Dokter" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Buka detail Pencarian Layanan" }),
  ).toBeVisible();
});

test("endpoint roadmap menolak permintaan tanpa sesi", async ({ request }) => {
  const response = await request.get(`/api/plan/roadmap/generate?planId=${planId}`);
  expect(response.status()).toBe(401);
});

test("roadmap yang dikosongkan pengguna tidak dibuat ulang diam-diam saat dimuat ulang", async ({
  page,
}) => {
  await signIn(page);
  const state = await roadmap(page);
  for (const feature of state.features) {
    await page.request.delete(`/api/plan/features/${feature.id}`);
  }
  await page.goto(`/plans/${planId}?step=4`);
  await expect(page.getByRole("heading", { name: "Roadmap masih kosong" })).toBeVisible();
  await page.waitForTimeout(1_000);
  expect((await roadmap(page)).status).toBe("idle");

  await page.getByRole("button", { name: "Buat roadmap" }).click();
  await expect(page.getByRole("link", { name: "Lanjutkan ke PRD" })).toBeVisible({
    timeout: 20_000,
  });
});
