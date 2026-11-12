import { authedRoute } from "@/features/auth/server";
import { planBodySchema } from "@/features/revision";
import { getRevisionService } from "@/features/revision/server";

/** "Abaikan": PRD dianggap selaras dengan fitur tanpa perubahan → `SyncStatus`. */
export const POST = authedRoute({ body: planBodySchema }, async ({ user, body }) =>
  getRevisionService().dismissPrdChange(user.id, body.planId),
);
