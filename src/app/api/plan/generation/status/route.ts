import { authedRoute } from "@/features/auth/server";
import { buildQuerySchema } from "@/features/specs";
import { getSpecsService } from "@/features/specs/server";

/** Keadaan spesifikasi & task: `{status, totalFeatures, doneFeatures, incompleteFeatureIds, job}`. */
export const GET = authedRoute({ query: buildQuerySchema }, async ({ user, query }) =>
  getSpecsService().getBuild(user.id, query.planId),
);
