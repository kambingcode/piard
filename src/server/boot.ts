import "server-only";

import { getEnv } from "@/server/config/env";
import { getDb, runMigrations } from "@/server/db/client";
import { type JobHandler, startJobRunner } from "@/server/jobs";
import { getLogger } from "@/server/logger";

export type BootOptions = {
  /** Handler job milik fitur, dipasang oleh `instrumentation.ts` (satu-satunya yang mengenal semua fitur). */
  jobHandlers: Record<string, JobHandler>;
  /**
   * Pekerjaan rumah tangga milik fitur (mis. menyapu sumber sementara proyek eksisting), dijalankan
   * sesudah migrasi. Kegagalannya dicatat tetapi tidak menghentikan boot.
   */
  startupTasks?: Record<string, () => void>;
};

/**
 * Menyiapkan proses server: memvalidasi env, menerapkan migrasi, menjalankan pekerjaan awal fitur, dan
 * menyalakan job runner. Sengaja gagal keras (melempar) bila env tidak valid agar kesalahan konfigurasi
 * langsung terlihat. Aman dipanggil berulang (hot reload).
 */
export function bootServer({ jobHandlers, startupTasks = {} }: BootOptions): void {
  const env = getEnv();
  runMigrations(getDb());
  for (const [name, run] of Object.entries(startupTasks)) {
    try {
      run();
    } catch (error) {
      getLogger("boot").warn("pekerjaan awal gagal", { task: name, error });
    }
  }
  startJobRunner(jobHandlers);
  getLogger("boot").info("server siap", {
    llmMode: env.llm.mode,
    database: env.databasePath,
  });
}
