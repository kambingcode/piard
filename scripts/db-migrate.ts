// Menerapkan migrasi ke database dari DATABASE_PATH. Dijalankan: `pnpm db:migrate`.
import { getEnv } from "@/server/config/env";
import { closeDb, getDb, runMigrations } from "@/server/db/client";
import { getLogger } from "@/server/logger";

const log = getLogger("db");

try {
  runMigrations(getDb());
  log.info("migrasi selesai", { path: getEnv().databasePath });
} catch (error) {
  log.error("migrasi gagal", { error });
  process.exitCode = 1;
} finally {
  closeDb();
}
