// Membuat akun pemilik untuk pengembangan lokal. Dijalankan: `pnpm db:seed`.
// Hanya untuk dev: menolak berjalan di produksi dan tidak menimpa akun yang sudah ada.
import { getAuthRepo } from "@/features/auth/server/repo";
import { createAuthService } from "@/features/auth/server/service";
import { getEnv } from "@/server/config/env";
import { closeDb, getDb, runMigrations } from "@/server/db/client";
import { getLogger } from "@/server/logger";

const DEV_OWNER = {
  name: "Pemilik Dev",
  email: "dev@piard.local",
  password: "piard-dev-123",
};

const log = getLogger("seed");

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:seed hanya untuk pengembangan; menolak berjalan di produksi.");
  }
  runMigrations(getDb());
  // Dirakit langsung (bukan lewat session.ts) karena skrip CLI tidak memuat modul Next.
  const auth = createAuthService({
    repo: getAuthRepo(),
    sessionTtlDays: getEnv().sessionTtlDays,
  });
  if (!auth.isSignUpOpen()) {
    log.info("sudah ada akun; seed dilewati");
    return;
  }
  const session = await auth.signUp(DEV_OWNER);
  auth.signOut(session.token); // seed hanya membuat akun, bukan sesi yang tertinggal
  // Kredensial dev tidak rahasia, jadi dicetak sebagai teks biasa (logger menyembunyikan kunci `password`).
  log.info(`akun dev dibuat: ${DEV_OWNER.email} / ${DEV_OWNER.password}`);
}

main()
  .catch((error: unknown) => {
    log.error("seed gagal", { error });
    process.exitCode = 1;
  })
  .finally(closeDb);
