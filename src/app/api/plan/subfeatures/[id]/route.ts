import { authedRoute } from "@/features/auth/server";
import { featureIdParamsSchema, patchSubFeatureSchema } from "@/features/roadmap";
import { getRoadmapService } from "@/features/roadmap/server";

const params = featureIdParamsSchema;

/** Mengubah sub-fitur → `{subFeature}`. */
export const PATCH = authedRoute(
  { params, body: patchSubFeatureSchema },
  async ({ user, params: { id }, body }) => ({
    subFeature: getRoadmapService().updateSubFeature(user.id, id, body),
  }),
);

/** Menghapus sub-fitur beserta task-nya → `{ok: true}`. */
export const DELETE = authedRoute({ params }, async ({ user, params: { id } }) => {
  getRoadmapService().deleteSubFeature(user.id, id);
  return { ok: true };
});
