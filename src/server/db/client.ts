import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getEnv } from "@/server/config/env";
import * as schema from "./schema";

/** Folder SQL migrasi hasil `pnpm db:generate`, relatif terhadap akar `app/`. */
export const MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle");

const IN_MEMORY = ":memory:";
const BUSY_TIMEOUT_MS = 5_000;

export type Db = BetterSQLite3Database<typeof schema>;

export type DbHandle = {
  db: Db;
  /** Koneksi mentah; hanya untuk menutup atau pragma. */
  sqlite: Database.Database;
  close: () => void;
};

/**
 * Membuka database SQLite dengan pengaturan yang aman: kunci asing aktif, WAL, dan timeout sibuk.
 *
 * @param path Lokasi berkas (relatif terhadap `process.cwd()`), atau `:memory:` untuk tes.
 */
export function createDb(path: string): DbHandle {
  if (path !== IN_MEMORY) mkdirSync(dirname(resolve(path)), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  if (path !== IN_MEMORY) sqlite.pragma("journal_mode = WAL");

  return { db: drizzle(sqlite, { schema }), sqlite, close: () => sqlite.close() };
}

/** Menerapkan semua migrasi yang belum dijalankan. Aman dipanggil berulang. */
export function runMigrations(db: Db, folder: string = MIGRATIONS_FOLDER): void {
  migrate(db, { migrationsFolder: folder });
}

// Disimpan di globalThis agar hot reload `next dev` tidak membuka koneksi baru tiap perubahan.
const globalForDb = globalThis as typeof globalThis & { __piardDb?: DbHandle };

/** Koneksi database proses ini (dibuat saat pertama dipakai). */
export function getDb(): Db {
  globalForDb.__piardDb ??= createDb(getEnv().databasePath);
  return globalForDb.__piardDb.db;
}

/** Menutup koneksi proses ini; dipakai saat shutdown dan tes. */
export function closeDb(): void {
  globalForDb.__piardDb?.close();
  globalForDb.__piardDb = undefined;
}
