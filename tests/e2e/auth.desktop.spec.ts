import { expect, OWNER, signIn, test } from "./fixtures";

// Satu akun pemilik dibuat di awal; langkah berikutnya memakai keadaan dari langkah sebelumnya.
test.describe.configure({ mode: "serial" });

test("halo dunia: tanpa sesi, /plan mengalihkan ke halaman masuk", async ({ page }) => {
  await page.goto("/plan");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Masuk ke Piard" }),
  ).toBeVisible();
});

test("health check publik menjawab ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("daftar: validasi di klien menampilkan galat di tiap kolom", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page.getByText("Nama wajib diisi.")).toBeVisible();
  await expect(page.getByText("Format email belum benar.")).toBeVisible();
  await expect(page.getByText("Kata sandi minimal 8 karakter.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
});

test("daftar membuat akun pemilik dan membuka /plan", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Nama").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(OWNER.password);
  await page.getByRole("button", { name: "Buat akun" }).click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Mau bikin apa hari ini?" }),
  ).toBeVisible();
  await expect(page.getByText(OWNER.email)).toBeVisible();
});

test("sesi bertahan setelah muat ulang dan beranda meneruskan ke /plan", async ({
  page,
}) => {
  await signIn(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Mau bikin apa hari ini?" }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/plan$/);
});

test("halaman /plan menampilkan dua kartu proyek dan keadaan kosong", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Proyek baru" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Proyek eksisting" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Analisis codebase" })).toHaveAttribute(
    "href",
    "/plan?flow=existing",
  );
  await expect(page.getByRole("heading", { name: "Belum ada plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mulai dengan ide" })).toHaveAttribute(
    "href",
    "/plan?flow=new",
  );
});

test("navigasi utama menandai halaman aktif dan punya tautan lewati", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("link", { name: "Plan baru" }).first()).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Lewati ke konten" })).toHaveCount(1);
});

test("halaman uji komponen tampil di terang dan gelap", async ({ page }) => {
  await signIn(page);
  await page.goto("/dev/components");
  const light = page.locator('[data-theme="light"]');
  const dark = page.locator('[data-theme="dark"]');
  const background = (locator: typeof light) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(light).toBeVisible();
  await expect(dark).toBeVisible();
  expect(await background(light)).toBe("rgb(250, 250, 248)");
  expect(await background(dark)).toBe("rgb(14, 14, 16)");
});

test("keluar menghapus sesi dan menutup rute area masuk", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Keluar" }).first().click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/plan");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("pendaftaran ditutup setelah akun pertama", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(
    page.getByRole("heading", { level: 1, name: "Pendaftaran ditutup" }),
  ).toBeVisible();
  await page.goto("/sign-in");
  await expect(page.getByRole("link", { name: "Buat akun" })).toHaveCount(0);
});

test("masuk: kata sandi salah memberi pesan generik, yang benar membuka /plan", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Kata sandi", { exact: true }).fill("salah-salah-salah");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Email atau kata sandi salah.",
  );
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel("Kata sandi", { exact: true }).fill(OWNER.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/plan$/);
});

test("kata sandi bisa ditampilkan lewat tombol dengan status yang diumumkan", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  const input = page.getByLabel("Kata sandi", { exact: true });
  await expect(input).toHaveAttribute("type", "password");
  const toggle = page.getByRole("button", { name: "Tampilkan kata sandi" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});
