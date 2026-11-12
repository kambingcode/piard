import { authedRoute } from "@/features/auth/server";
import { planBodySchema } from "@/features/revision";
import { getRevisionService } from "@/features/revision/server";

/** "Sesuaikan fitur dengan PRD": memulai job pembanding → `SyncStatus`. */
export const POST = authedRoute({ body: planBodySchema }, async ({ user, body }) =>
  getRevisionService().startReconcile(user.id, body.planId),
);
