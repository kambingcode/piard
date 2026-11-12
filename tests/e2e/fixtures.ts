import { test as base, expect, type Page } from "@playwright/test";

export const OWNER = {
  name: "Pemilik Uji",
  email: "pemilik@piard.local",
  password: "kata-sandi-aman-123",
};

/**
 * Test dasar yang gagal bila halaman menulis galat ke konsol atau melempar pengecualian
 * (termasuk peringatan hidrasi React), agar galat klien tidak lolos diam-diam.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        // Respons 4xx yang memang diuji (mis. kata sandi salah) dicatat browser sebagai galat jaringan.
        if (/Failed to load resource: .* status of 4\d\d/.test(message.text())) return;
        errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "galat konsol/halaman").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Masuk lewat UI dengan akun pemilik (yang dibuat oleh tes pendaftaran). Tiap tes punya konteks baru. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(OWNER.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/plan$/);
}
