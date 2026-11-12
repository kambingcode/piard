import { authedRoute } from "@/features/auth/server";
import { reviseSchema } from "@/features/prd";
import { getPrdService } from "@/features/prd/server";

/** Memulai revisi PRD → `{status, fromVersion, jobId}`; tanpa `instructions` mengulang revisi terakhir. */
export const POST = authedRoute({ body: reviseSchema }, async ({ user, body }) =>
  getPrdService().startRevision(user.id, body.planId, body.instructions),
);
