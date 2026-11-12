import { authedRoute } from "@/features/auth/server";
import { createSubFeatureSchema } from "@/features/roadmap";
import { getRoadmapService } from "@/features/roadmap/server";

/** Menambah sub-fitur di bawah fitur → `{subFeature}`. */
export const POST = authedRoute(
  { body: createSubFeatureSchema },
  async ({ user, body }) => ({
    subFeature: getRoadmapService().createSubFeature(user.id, body),
  }),
);
