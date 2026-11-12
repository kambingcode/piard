import { expect, OWNER, signIn, test } from "./fixtures";

// Akun pemilik dibuat oleh auth.desktop.spec.ts (berkas ini berjalan sesudahnya).
test.describe.configure({ mode: "serial" });

const IDEA = "Aplikasi booking klinik untuk pasien dan dokter, dengan pembayaran online.";
let planId = "";

test("alur M1: ide → preferensi teknologi → 5 pertanyaan → struktur (mode mock)", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Mulai dengan ide" }).click();
  await expect(page).toHaveURL(/\/plan\?flow=new$/);

  // Langkah 1: tombol nonaktif saat kosong, contoh bisa diklik, Ctrl+Enter mengirim.
  const submit = page.getByRole("button", { name: "Buat rencana" });
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: /Pencatat pengeluaran harian/ }).click();
  await expect(submit).toBeEnabled();
  await page.getByLabel("Ide aplikasi").fill(IDEA);
  await page.getByLabel("Bahasa hasil").selectOption("id");
  await page.getByLabel("Ide aplikasi").press("Control+Enter");

  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}\?step=2$/);
  planId = new URL(page.url()).pathname.split("/").pop() ?? "";
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Aplikasi booking klinik",
  );

  // Langkah 2: bawaan "Biarkan AI pilih"; pilih sendiri lalu isi, tersimpan otomatis.
  await expect(page.getByRole("radio", { name: /Biarkan AI pilih/ })).toBeChecked();
  await page.getByRole("radio", { name: /Pilih sendiri/ }).check({ force: true });
  await page.getByLabel("Backend").selectOption("Laravel (PHP)");
  await page.getByRole("checkbox", { name: "Pembayaran" }).check({ force: true });
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lanjut ke pertanyaan" }).click();

  // Langkah 3: pertanyaan dibuat (mock), satu per layar.
  await expect(page).toHaveURL(/step=3$/);
  await expect(page.getByText("Pertanyaan 1 dari 5")).toBeVisible();
  const next = page.getByRole("button", { name: "Lanjut", exact: true });
  await expect(next).toBeDisabled();
  await page
    .getByRole("textbox")
    .first()
    .fill("Dewi, ibu pekerja yang antre lama di klinik");
  await next.click();

  await expect(page.getByText("Pertanyaan 2 dari 5")).toBeVisible();
  await page.keyboard.press("2"); // pintasan angka memilih opsi kedua
  await expect(
    page.getByRole("radio", { name: "Mencari yang dibutuhkan" }),
  ).toBeChecked();
  await next.click();

  await expect(page.getByText("Pertanyaan 3 dari 5")).toBeVisible();
  await page.getByRole("checkbox", { name: "Pencarian" }).check({ force: true });
  await page.getByRole("checkbox", { name: "Pembayaran online" }).check({ force: true });
  await next.click();

  await expect(page.getByText("Pertanyaan 4 dari 5")).toBeVisible();
  await page.getByRole("button", { name: "Lewati" }).click();

  await expect(page.getByText("Pertanyaan 5 dari 5")).toBeVisible();
  await page.getByRole("radio", { name: "Lainnya" }).check({ force: true });
  await page.getByRole("textbox", { name: "Lainnya" }).fill("Diskon kunjungan ke-5");
  await page.getByRole("button", { name: "Bikin Struktur" }).click();

  await expect(page).toHaveURL(/step=4$/);
  await expect(page.getByRole("heading", { name: "Struktur rencana" })).toBeVisible();
});

test("semua isian tersimpan di server dan bertahan setelah muat ulang", async ({
  page,
}) => {
  await signIn(page);
  const response = await page.request.get(`/api/plan/${planId}`);
  expect(response.status()).toBe(200);
  const { plan } = await response.json();

  expect(plan).toMatchObject({
    idea: IDEA,
    step: 4,
    techStack: { backend: "Laravel (PHP)", database: "ai-pilih" },
    extras: ["Pembayaran"],
  });
  expect(plan.questionAnswers.questions).toHaveLength(5);
  expect(plan.questionAnswers.answers).toEqual({
    real_user_pain: "Dewi, ibu pekerja yang antre lama di klinik",
    first_win: "Mencari yang dibutuhkan",
    must_have_features: ["Pencarian", "Pembayaran online"],
    main_advantage: "", // dilewati: kunci ada, nilai kosong
    come_back_reason: "Diskon kunjungan ke-5",
  });

  // Membuka langkah 3 lagi menampilkan pertanyaan terakhir dengan jawaban utuh.
  await page.goto(`/plans/${planId}?step=3`);
  await expect(page.getByText("Pertanyaan 5 dari 5")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Lainnya" })).toHaveValue(
    "Diskon kunjungan ke-5",
  );

  // Langkah 2 mengingat pilihan sendiri.
  await page.goto(`/plans/${planId}?step=2`);
  await expect(page.getByRole("radio", { name: /Pilih sendiri/ })).toBeChecked();
  await expect(page.getByLabel("Backend")).toHaveValue("Laravel (PHP)");
  await expect(page.getByRole("checkbox", { name: "Pembayaran" })).toBeChecked();
});

test("landing menawarkan lanjutkan plan terakhir dan penanda langkah bisa dipakai", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("link", { name: /Aplikasi booking klinik/ })
    .first()
    .click();
  await expect(page).toHaveURL(/step=4$/);

  const stepper = page.getByRole("navigation", { name: "Langkah penyusunan rencana" });
  await expect(stepper.getByRole("listitem").nth(3)).toHaveAttribute(
    "aria-current",
    "step",
  );
  await stepper.getByRole("link", { name: "Pertanyaan" }).click();
  await expect(page).toHaveURL(/step=3$/);
});

test("alamat langkah dijaga: di luar langkah tercapai dialihkan, plan asing 404", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/plan?flow=new");
  await page.getByLabel("Ide aplikasi").fill("Plan baru yang belum jauh");
  await page.getByRole("button", { name: "Buat rencana" }).click();
  await expect(page).toHaveURL(/step=2$/);
  const id = new URL(page.url()).pathname.split("/").pop();

  await page.goto(`/plans/${id}?step=4`);
  await expect(page).toHaveURL(/step=2$/);
  await page.goto(`/plans/${id}`);
  await expect(page).toHaveURL(/step=2$/);
  await page.goto(`/plans/${id}?step=abc`);
  await expect(page).toHaveURL(/step=2$/);

  const missing = await page.goto("/plans/00000000-0000-0000-0000-000000000000");
  expect(missing?.status()).toBe(404);
});

test("daftar plan dan riwayat: hapus dengan Undo", async ({ page }) => {
  await page.clock.install();
  await signIn(page);
  await page.goto("/plans");
  await expect(page.getByRole("heading", { level: 1, name: "Semua plan" })).toBeVisible();
  const rows = page.getByRole("main").getByRole("listitem");
  // Jumlah awal dari API: spec lain (mis. plan fitur baru dari proyek eksisting) bisa menambah plan.
  const before: number = (await (await page.request.get("/api/plan/list")).json()).plans
    .length;
  await expect(rows).toHaveCount(before);

  // Riwayat sidebar dikelompokkan per hari.
  const sidebar = page.locator("aside").filter({ hasText: "Riwayat" });
  await expect(sidebar.getByRole("heading", { name: "Hari ini" })).toBeVisible();

  const target = "Plan baru yang belum jauh";
  await page
    .getByRole("button", { name: `Hapus plan "${target}"` })
    .first()
    .click();
  await expect(rows).toHaveCount(before - 1);
  await expect(page.getByText(`Plan "${target}" dihapus.`)).toBeVisible();

  // Urungkan mengembalikan plan dan tidak ada DELETE yang dikirim.
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(rows).toHaveCount(before);
  await page.clock.fastForward(10_000);
  expect((await (await page.request.get("/api/plan/list")).json()).plans).toHaveLength(
    before,
  );

  // Tanpa Urungkan, plan benar-benar terhapus setelah jendela habis.
  await page
    .getByRole("button", { name: `Hapus plan "${target}"` })
    .first()
    .click();
  await expect(rows).toHaveCount(before - 1);
  await page.clock.fastForward(9_000);
  await expect
    .poll(
      async () => (await (await page.request.get("/api/plan/list")).json()).plans.length,
    )
    .toBe(before - 1);
  await expect(rows).toHaveCount(before - 1);
});

test("endpoint plan menolak permintaan tanpa sesi", async ({ request }) => {
  const response = await request.get(`/api/plan/${planId}`);
  expect(response.status()).toBe(401);
  expect(OWNER.email).toBeTruthy();
});

test("draf ide diingat browser setelah muat ulang, dan hilang setelah dikosongkan", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/plan?flow=new");
  const idea = page.getByLabel("Ide aplikasi");
  await idea.fill("Draf ide uji yang belum dikirim");
  await page.reload();
  await expect(idea).toHaveValue("Draf ide uji yang belum dikirim");
  await expect(
    page.getByText("Draf ide terakhir dipulihkan dari browser ini."),
  ).toBeVisible();
  await idea.fill("");
  await page.reload();
  await expect(idea).toHaveValue("");
});
