import { planQuerySchema } from "@/features/agent-bridge";
import { getTokenService } from "@/features/agent-bridge/server";
import { authedRoute } from "@/features/auth/server";

/** Mencabut semua token agen plan `{planId}` → `{revoked}`. */
export const POST = authedRoute({ body: planQuerySchema }, async ({ user, body }) =>
  getTokenService().revokeAll(user.id, body.planId),
);
