import { authedRoute } from "@/features/auth/server";
import { featureIdParamsSchema, patchFeatureSchema } from "@/features/roadmap";
import { getRoadmapService } from "@/features/roadmap/server";

const params = featureIdParamsSchema;

/** Mengubah fitur roadmap → `{feature}`. */
export const PATCH = authedRoute(
  { params, body: patchFeatureSchema },
  async ({ user, params: { id }, body }) => ({
    feature: getRoadmapService().updateFeature(user.id, id, body),
  }),
);

/** Menghapus fitur beserta sub-fitur dan task-nya → `{ok: true}`. */
export const DELETE = authedRoute({ params }, async ({ user, params: { id } }) => {
  getRoadmapService().deleteFeature(user.id, id);
  return { ok: true };
});
