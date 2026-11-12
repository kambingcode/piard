import { defineConfig } from "drizzle-kit";

// Hanya dipakai `pnpm db:generate` (membuat SQL migrasi dari skema); tidak menyentuh database.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
