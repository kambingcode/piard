import { authedRoute } from "@/features/auth/server";
import { createFeatureSchema } from "@/features/roadmap";
import { getRoadmapService } from "@/features/roadmap/server";

/** Fitur tambahan dari pengguna (`source: "user"`), ditaruh di akhir daftar. */
export const POST = authedRoute(
  { body: createFeatureSchema },
  async ({ user, body }) => ({
    feature: getRoadmapService().createFeature(user.id, body),
  }),
);
