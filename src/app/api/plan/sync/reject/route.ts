import { authedRoute } from "@/features/auth/server";
import { proposalBodySchema } from "@/features/revision";
import { getRevisionService } from "@/features/revision/server";

/** Menolak usulan → `{proposal, sync}`; roadmap tidak berubah. */
export const POST = authedRoute({ body: proposalBodySchema }, async ({ user, body }) =>
  getRevisionService().rejectProposal(user.id, body.proposalId),
);
