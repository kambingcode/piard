import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
// Keluaran e2e (database, trace, laporan) berada di luar folder proyek agar repo tetap bersih.
const E2E_DIR = join(tmpdir(), "piard-e2e");
const E2E_DB = join(E2E_DIR, "e2e.db");

/**
 * E2E memakai Chrome yang sudah terpasang (channel "chrome") terhadap build produksi di port 3200
 * (tanpa HMR sehingga stabil, dan sekaligus menguji build), database SQLite terpisah yang
 * dihapus setiap kali dijalankan, dan LLM_MODE=mock sehingga tidak ada jaringan atau biaya.
 */
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: join(E2E_DIR, "results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
    locale: "id-ID",
  },
  projects: [
    {
      name: "desktop",
      testMatch: /.*\.desktop\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      testMatch: /.*\.mobile\.spec\.ts/,
      dependencies: ["desktop"],
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
    {
      // Pemeriksaan aksesibilitas (axe) setelah desktop membuat akun dan plan berisi.
      name: "a11y",
      testMatch: /.*\.a11y\.spec\.ts/,
      dependencies: ["desktop"],
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: `rm -f "${E2E_DB}" "${E2E_DB}-wal" "${E2E_DB}-shm" && pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 240_000,
    env: {
      // Playwright mengeset NODE_ENV=test dan itu diwariskan; Next hanya mendukung production/development.
      NODE_ENV: "production",
      DATABASE_PATH: E2E_DB,
      LLM_MODE: "mock",
      LOG_LEVEL: "warn",
    },
  },
});
