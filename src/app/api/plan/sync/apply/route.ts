import { authedRoute } from "@/features/auth/server";
import { proposalBodySchema } from "@/features/revision";
import { getRevisionService } from "@/features/revision/server";

/** Menerima usulan → `{proposal, changed, sync}`; perubahan diterapkan ke roadmap. */
export const POST = authedRoute({ body: proposalBodySchema }, async ({ user, body }) =>
  getRevisionService().applyProposal(user.id, body.proposalId),
);
