import { authedRoute } from "@/features/auth/server";
import { generatePrdSchema, prdQuerySchema } from "@/features/prd";
import { getPrdService } from "@/features/prd/server";

/** Memulai job PRD → `{status}`; idempoten kecuali `regenerate` (versi baru). */
export const POST = authedRoute({ body: generatePrdSchema }, async ({ user, body }) =>
  getPrdService().startPrd(user.id, body.planId, { regenerate: body.regenerate }),
);

/** Polling keadaan PRD: `{status, document, draft, job}`. */
export const GET = authedRoute({ query: prdQuerySchema }, async ({ user, query }) =>
  getPrdService().getPrd(user.id, query.planId),
);
