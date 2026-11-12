import { authedRoute } from "@/features/auth/server";
import { planQuerySchema } from "@/features/revision";
import { getRevisionService } from "@/features/revision/server";

/** Keadaan sinkronisasi PRD ↔ fitur ↔ task → `SyncStatus`. */
export const GET = authedRoute({ query: planQuerySchema }, async ({ user, query }) =>
  getRevisionService().getSyncStatus(user.id, query.planId),
);
