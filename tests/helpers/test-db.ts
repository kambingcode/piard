import { createDb, type DbHandle, runMigrations } from "@/server/db/client";
import { users } from "@/server/db/schema";

/** Database SQLite di memori dengan semua migrasi terpasang, untuk tes integrasi. */
export function createTestDb(): DbHandle {
  const handle = createDb(":memory:");
  runMigrations(handle.db);
  return handle;
}

/** Pengguna minimal untuk tes yang butuh kunci asing ke `users`. */
export function seedUser(db: DbHandle["db"], email = "tes@piard.local") {
  return db
    .insert(users)
    .values({ email, passwordHash: "x", name: "Tes" })
    .returning()
    .get();
}
