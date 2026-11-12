import { createTokenSchema, planQuerySchema } from "@/features/agent-bridge";
import { getTokenService } from "@/features/agent-bridge/server";
import { authedRoute } from "@/features/auth/server";

/** Token agen plan tanpa nilainya → `{tokens}` (terbaru dulu, termasuk yang dicabut/kedaluwarsa). */
export const GET = authedRoute({ query: planQuerySchema }, async ({ user, query }) => ({
  tokens: getTokenService().list(user.id, query.planId),
}));

/**
 * Token agen baru `{planId, label, ttlDays: 7|30|90}` → `{token, agentToken}`. Token mentah (`ppl_…`)
 * hanya ada di respons ini; maks. 5 token aktif per plan.
 */
export const POST = authedRoute({ body: createTokenSchema }, async ({ user, body }) =>
  getTokenService().create(user.id, body),
);
