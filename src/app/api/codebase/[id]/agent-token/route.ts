import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema } from "@/features/codebase";
import { getAgentService } from "@/features/codebase/server";

const params = codebaseIdParamsSchema;

/** Status token agen tanpa tokennya → `{active, expiresAt, lastUsedAt}`. */
export const GET = authedRoute({ params }, async ({ user, params: { id } }) =>
  getAgentService().tokenStatus(user.id, id),
);

/**
 * Token agen baru (`pcb_…`, berlaku 24 jam, token lama dicabut) → `{token, expiresAt}`. Token mentah
 * hanya ada di respons ini; server menyimpan hash-nya saja.
 */
export const POST = authedRoute({ params }, async ({ user, params: { id } }) =>
  getAgentService().createToken(user.id, id),
);

/** Mencabut token agen yang aktif → `{revoked}`. */
export const DELETE = authedRoute({ params }, async ({ user, params: { id } }) =>
  getAgentService().revokeTokens(user.id, id),
);
