import "server-only";

import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { workspaces } from "./schema";

const DEFAULT_WORKSPACE_NAME = "Pribadi";

/**
 * Workspace bawaan pengguna; dibuat saat pertama dibutuhkan. Ada di infrastruktur (bukan repo satu
 * fitur) karena plan dan proyek eksisting sama-sama butuh, dan `codebase` tidak boleh bergantung pada
 * `plans` (`plans` yang nanti membaca konteks `codebase`, ADR 0016).
 */
export function ensureDefaultWorkspace(
  db: Db,
  userId: string,
): { id: string; name: string } {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(workspaces.createdAt)
      .limit(1)
      .get();
    if (existing) return existing;
    return tx
      .insert(workspaces)
      .values({ userId, name: DEFAULT_WORKSPACE_NAME })
      .returning()
      .get();
  });
}
