import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";
import { agent, createAgentToken } from "./agent-helpers";
import { analyzedCodebase, projectZip, uploadAndAnalyze } from "./codebase-helpers";
import { expect, signIn, test } from "./fixtures";

/**
 * Pemeriksaan aksesibilitas dasar (WCAG 2.1 A/AA lewat axe) untuk setiap layar utama, di tema terang dan
 * gelap. Berjalan setelah project desktop sehingga akun dan plan berisi sudah ada.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return result.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((node) => node.target.join(" ")),
  }));
}

/** Plan uji dari spec desktop: `tasks` (berisi task) atau `prd` (punya beberapa versi PRD). */
async function firstPlanId(
  page: Page,
  name = /Aplikasi antre potong rambut/,
): Promise<string> {
  await page.goto("/plans");
  const href = await page
    .getByRole("main")
    .getByRole("link", { name })
    .first()
    .getAttribute("href");
  const id = href?.match(/\/plans\/([0-9a-f-]{36})/)?.[1];
  if (!id) throw new Error(`plan uji tidak ditemukan (${href})`);
  return id;
}

/** Plan yang PRD-nya punya minimal dua versi (spec PRD dan revisi membuatnya). */
async function planWithVersions(page: Page): Promise<string> {
  await page.goto("/plans");
  const hrefs = await page
    .getByRole("main")
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  for (const href of hrefs) {
    const id = href.match(/^\/plans\/([0-9a-f-]{36})/)?.[1];
    if (!id) continue;
    await page.goto(`/plans/${id}/prd`);
    await page.waitForLoadState("networkidle"); // daftar versi dimuat di klien
    const options = page.getByLabel("Versi", { exact: true }).locator("option");
    if ((await options.count()) >= 2) return id;
  }
  throw new Error("tidak ada plan dengan dua versi PRD");
}

test("halaman masuk tanpa pelanggaran axe", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/sign-in");
    expect(await violations(page), `/sign-in (${scheme})`).toEqual([]);
  }
});

test("layar aplikasi tanpa pelanggaran axe di tema terang dan gelap", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const id = await firstPlanId(page);
  const screens = [
    "/plan",
    "/plans",
    `/plans/${id}?step=4`,
    `/plans/${id}/prd`,
    `/plans/${id}/tasks`,
    `/plans/${id}/kanban`,
    `/plans/${id}/usage`,
    "/settings",
  ];
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of screens) {
      await page.goto(path);
      await page.getByRole("main").waitFor();
      await page.waitForLoadState("networkidle");
      expect(await violations(page), `${path} (${scheme})`).toEqual([]);
    }
  }
});

test("lapisan interaktif tanpa pelanggaran axe: palette, editor task, diff PRD", async ({
  page,
}) => {
  await signIn(page);
  const id = await firstPlanId(page);
  await page.goto(`/plans/${id}/tasks`);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Cari dan perintah" })).toBeVisible();
  expect(await violations(page), "palette").toEqual([]);
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { name: /^Ubah task / })
    .first()
    .click();
  await expect(page.getByLabel("Prompt", { exact: true })).toBeVisible();
  expect(await violations(page), "editor task").toEqual([]);

  const prdPlan = await planWithVersions(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/plans/${prdPlan}/prd`);
    await page.getByLabel("Versi", { exact: true }).selectOption("1");
    await page.getByRole("button", { name: "Bandingkan dengan terbaru" }).click();
    await expect(
      page.getByRole("region", { name: /^Perbedaan versi 1 dan/ }),
    ).toBeVisible();
    expect(await violations(page), `diff PRD (${scheme})`).toEqual([]);
  }
});

/**
 * Proyek eksisting (M7): alur awal, daftar, dokumentasi dengan diagram, editor, usulan analisis ulang
 * yang dibandingkan berdampingan, dan panel agen dengan token yang baru dibuat.
 */
test("layar proyek eksisting tanpa pelanggaran axe di tema terang dan gelap", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const id = await analyzedCodebase(page, "Toko Aksesibel");
  // Edit manual lalu analisis ulang: halaman ringkasan menerima usulan.
  await page.request.post(`/api/codebase/${id}/docs`, {
    data: { slug: "ringkasan", content: "Ditulis tangan." },
  });
  await uploadAndAnalyze(page, id, projectZip({ "src/features/promo/service.ts": "x" }));
  const agent = await (
    await page.request.post("/api/codebase/create", {
      data: { name: "Agen Aksesibel", source: "agent", language: "id" },
    })
  ).json();

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of [
      "/plan?flow=existing",
      "/codebases",
      `/codebases/${id}`,
      `/codebases/${id}?page=arsitektur`,
    ]) {
      await page.goto(path);
      await page.getByRole("main").waitFor();
      await page.waitForLoadState("networkidle");
      expect(await violations(page), `${path} (${scheme})`).toEqual([]);
    }

    await page.goto(`/codebases/${id}?page=ringkasan`);
    await page.getByRole("button", { name: "Bandingkan" }).click();
    await expect(page.getByText("Usulan (AI)")).toBeVisible();
    expect(await violations(page), `usulan (${scheme})`).toEqual([]);
    await page.getByRole("button", { name: "Ubah" }).click();
    await expect(page.getByLabel("Isi halaman (Markdown)")).toBeVisible();
    expect(await violations(page), `editor dokumentasi (${scheme})`).toEqual([]);

    await page.goto(`/codebases/${agent.codebase.id}`);
    await page.getByRole("button", { name: /^Buat token/ }).click();
    await expect(page.getByText("Token ini hanya ditampilkan sekali")).toBeVisible();
    expect(await violations(page), `panel agen (${scheme})`).toEqual([]);
  }
});

/**
 * Tangkapan layar M6-03 (doc 08: empat lebar, terang dan gelap). Hanya berjalan bila `UX_SCREENSHOTS`
 * berisi folder tujuan, mis. `UX_SCREENSHOTS=../analysis/ux-screens pnpm e2e`.
 */
/**
 * Jembatan agen (M8): kanban empat kolom dengan card AI (Dikerjakan + pertanyaan, Review), dialog
 * "Hubungkan AI" dengan token baru, dan detail card dengan linimasa.
 */
test("kanban dengan agen tanpa pelanggaran axe di tema terang dan gelap", async ({
  page,
}) => {
  await signIn(page);
  const id = await firstPlanId(page, /Aplikasi catatan servis motor/);
  const token = await createAgentToken(page, id, "Axe");
  const api = await playwrightRequest.newContext({ baseURL: page.url() });
  const bot = agent(api, token);
  const first = (await bot.next()).body.task;
  await bot.claim(first.id);
  await bot.report(first.id, "Selesai untuk diperiksa axe.");
  const second = (await bot.next()).body.task;
  await bot.claim(second.id);
  await bot.note(second.id, "Pertanyaan untuk diperiksa axe?", "question");
  await api.dispose();

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/plans/${id}/kanban`);
    await expect(page.locator(`li[data-task-id="${second.id}"]`)).toContainText(
      "AI butuh jawaban",
    );
    expect(await violations(page), `kanban (${scheme})`).toEqual([]);

    await page.getByRole("button", { name: "Hubungkan AI" }).click();
    const dialog = page.getByRole("dialog", { name: "Hubungkan AI ke kanban ini" });
    await dialog.getByRole("button", { name: "Buat token" }).click();
    await expect(
      dialog.getByText("Token hanya tampil sekali.", { exact: false }),
    ).toBeVisible();
    expect(await violations(page), `hubungkan AI (${scheme})`).toEqual([]);
    await dialog.getByRole("button", { name: "Tutup" }).click();

    await page
      .getByRole("button", { name: `Detail dan catatan: ${first.title}` })
      .click();
    await expect(page.getByRole("dialog", { name: first.title })).toContainText(
      "Laporan",
    );
    expect(await violations(page), `detail card (${scheme})`).toEqual([]);
    await page.keyboard.press("Escape");
  }
});

test("tangkapan layar empat lebar", async ({ page }) => {
  const dir = process.env.UX_SCREENSHOTS;
  test.skip(!dir, "set UX_SCREENSHOTS untuk menyimpan tangkapan layar");
  test.setTimeout(240_000);
  await signIn(page);
  const id = await firstPlanId(page);
  const screens: [string, string][] = [
    ["plan", "/plan"],
    ["roadmap", `/plans/${id}?step=4`],
    ["prd", `/plans/${id}/prd`],
    ["tasks", `/plans/${id}/tasks`],
    ["kanban", `/plans/${id}/kanban`],
    ["usage", `/plans/${id}/usage`],
    ["settings", "/settings"],
    ["existing", "/plan?flow=existing"],
    ["codebases", "/codebases"],
  ];
  // Proyek berdokumentasi dari tes axe di atas (dibuat lewat API, tidak dihapus).
  await page.goto("/codebases");
  const project = await page
    .getByRole("main")
    .getByRole("link", { name: "Toko Aksesibel" })
    .getAttribute("href");
  if (project) screens.push(["codebase-docs", `${project}?page=arsitektur`]);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      for (const [name, path] of screens) {
        await page.goto(path);
        await page.getByRole("main").waitFor();
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${dir}/${name}-${width}-${scheme}.png` });
      }
    }
  }
});
