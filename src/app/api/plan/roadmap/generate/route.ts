import { authedRoute } from "@/features/auth/server";
import { generateRoadmapSchema, planQuerySchema } from "@/features/roadmap";
import { getRoadmapService } from "@/features/roadmap/server";

/** Memulai job roadmap → `{status}`; idempoten kecuali `regenerate`. */
export const POST = authedRoute({ body: generateRoadmapSchema }, async ({ user, body }) =>
  getRoadmapService().startRoadmap(user.id, body.planId, { regenerate: body.regenerate }),
);

/** Polling keadaan roadmap: `{status, title, features, subFeatures, job}`. */
export const GET = authedRoute({ query: planQuerySchema }, async ({ user, query }) =>
  getRoadmapService().getRoadmap(user.id, query.planId),
);
