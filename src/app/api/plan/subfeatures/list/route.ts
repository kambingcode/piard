import { authedRoute } from "@/features/auth/server";
import { subFeatureListQuerySchema } from "@/features/roadmap";
import { getRoadmapService } from "@/features/roadmap/server";

/** Sub-fitur plan (opsional satu fitur) → `{subFeatures}`; `featureId` = `parentId`. */
export const GET = authedRoute(
  { query: subFeatureListQuerySchema },
  async ({ user, query }) => ({
    subFeatures: getRoadmapService().listSubFeatures(
      user.id,
      query.planId,
      query.featureId,
    ),
  }),
);
