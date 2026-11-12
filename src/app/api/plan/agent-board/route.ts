import { planQuerySchema } from "@/features/agent-bridge";
import { getBoardService } from "@/features/agent-bridge/server";
import { authedRoute } from "@/features/auth/server";

/**
 * Keadaan agen per card kanban → `{cards: {[taskId]: {tokenLabel, claimedAt, lastAgentAt, openQuestion,
 * notes}}}`.
 */
export const GET = authedRoute({ query: planQuerySchema }, async ({ user, query }) =>
  getBoardService().meta(user.id, query.planId),
);
