import { authedRoute } from "@/features/auth/server";
import { patchPlanSchema, planIdParamsSchema } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";

const params = planIdParamsSchema;

/** Detail plan → `{plan, attachments, chatMessages, documents}` (bentuk situs acuan). */
export const GET = authedRoute({ params }, async ({ user, params: { id } }) =>
  getPlansService().getPlan(user.id, id),
);

/** Mengubah sebagian plan (autosave wizard) → `{ok: true}`. Field tak dikenal diabaikan. */
export const PATCH = authedRoute(
  { params, body: patchPlanSchema },
  async ({ user, params: { id }, body }) => {
    getPlansService().updatePlan(user.id, id, body);
    return { ok: true };
  },
);

/** Menghapus plan beserta fitur, task, dokumen, dan job-nya → `{ok: true}`. */
export const DELETE = authedRoute({ params }, async ({ user, params: { id } }) => {
  getPlansService().deletePlan(user.id, id);
  return { ok: true };
});
