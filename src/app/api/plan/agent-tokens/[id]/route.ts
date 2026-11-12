import { idParamsSchema } from "@/features/agent-bridge";
import { getTokenService } from "@/features/agent-bridge/server";
import { authedRoute } from "@/features/auth/server";

/** Mencabut satu token agen → `{agentToken}`. */
export const DELETE = authedRoute(
  { params: idParamsSchema },
  async ({ user, params }) => ({
    agentToken: getTokenService().revoke(user.id, params.id),
  }),
);
