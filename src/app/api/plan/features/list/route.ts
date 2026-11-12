import { authedRoute } from "@/features/auth/server";
import { planQuerySchema } from "@/features/roadmap";
import { getRoadmapService } from "@/features/roadmap/server";

/** Fitur utama plan urut posisi → `{features}`. */
export const GET = authedRoute({ query: planQuerySchema }, async ({ user, query }) => ({
  features: getRoadmapService().listFeatures(user.id, query.planId),
}));
