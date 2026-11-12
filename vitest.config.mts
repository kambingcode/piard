import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // Paket asli melempar galat di luar bundler Next; di tes cukup modul kosong.
      "server-only": fromRoot("./tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/{unit,integration,contract}/**/*.test.ts"],
    // Galat yang disengaja di tes tidak perlu mengotori keluaran.
    env: { LOG_LEVEL: "silent" },
    clearMocks: true,
    restoreMocks: true,
  },
});
