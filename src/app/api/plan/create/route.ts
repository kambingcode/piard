import { authedRoute } from "@/features/auth/server";
import { createPlanSchema } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";

/** Membuat plan dari ide. Klien lanjut ke `/plans/:id?step=2`. */
export const POST = authedRoute({ body: createPlanSchema }, async ({ user, body }) => ({
  plan: getPlansService().createPlan(user.id, body),
}));
