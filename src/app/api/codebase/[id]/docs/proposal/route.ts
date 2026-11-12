import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema, proposalActionSchema } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";

/** Terima (`accept`: menjadi versi baru) atau tolak (`reject`) usulan analisis ulang → `{page, versions, proposal}`. */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema, body: proposalActionSchema },
  async ({ user, params: { id }, body }) =>
    getCodebaseService().resolveProposal(user.id, id, body.slug, body.action),
);
