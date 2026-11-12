import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { type Db, getDb } from "@/server/db/client";
import { plans, workspaces } from "@/server/db/schema";
import { ensureDefaultWorkspace } from "@/server/db/workspaces";

export type PlanRow = typeof plans.$inferSelect & { workspaceName: string };
export type PlanUpdate = Partial<
  Pick<
    typeof plans.$inferInsert,
    | "techStack"
    | "extras"
    | "questionAnswers"
    | "step"
    | "title"
    | "status"
    | "syncState"
    | "agentInstructions"
  >
>;

/** Satu-satunya tempat di fitur plans yang tahu tabel `plans` dan `workspaces`. */
export function createPlansRepo(db: Db) {
  const selectPlans = () =>
    db
      .select({ plan: plans, workspaceName: workspaces.name })
      .from(plans)
      .innerJoin(workspaces, eq(workspaces.id, plans.workspaceId));

  const toRow = (row: {
    plan: typeof plans.$inferSelect;
    workspaceName: string;
  }): PlanRow => ({
    ...row.plan,
    workspaceName: row.workspaceName,
  });

  return {
    /** Workspace bawaan pengguna; dibuat saat pertama dibutuhkan. */
    ensureDefaultWorkspace(userId: string): { id: string; name: string } {
      return ensureDefaultWorkspace(db, userId);
    },

    insert(input: typeof plans.$inferInsert): PlanRow {
      const inserted = db.insert(plans).values(input).returning().get();
      const row = this.find(inserted.userId, inserted.id);
      if (!row) throw new Error("Plan yang baru dibuat tidak ditemukan");
      return row;
    },

    /** Plan milik `userId`; plan orang lain diperlakukan seperti tidak ada. */
    find(userId: string, id: string): PlanRow | undefined {
      const row = selectPlans()
        .where(and(eq(plans.id, id), eq(plans.userId, userId)))
        .get();
      return row ? toRow(row) : undefined;
    },

    /** Pemilik plan, untuk token agen yang mengikat plan, bukan sesi (ADR 0017). */
    ownerOf(id: string): string | undefined {
      return db.select({ userId: plans.userId }).from(plans).where(eq(plans.id, id)).get()
        ?.userId;
    },

    list(userId: string): PlanRow[] {
      return selectPlans()
        .where(eq(plans.userId, userId))
        .orderBy(desc(plans.updatedAt))
        .all()
        .map(toRow);
    },

    update(userId: string, id: string, patch: PlanUpdate): boolean {
      const result = db
        .update(plans)
        .set(patch)
        .where(and(eq(plans.id, id), eq(plans.userId, userId)))
        .run();
      return result.changes > 0;
    },

    delete(userId: string, id: string): boolean {
      const result = db
        .delete(plans)
        .where(and(eq(plans.id, id), eq(plans.userId, userId)))
        .run();
      return result.changes > 0;
    },
  };
}

export type PlansRepo = ReturnType<typeof createPlansRepo>;

/** Repo untuk database proses ini. */
export const getPlansRepo = (): PlansRepo => createPlansRepo(getDb());
