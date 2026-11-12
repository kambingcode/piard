import { authedRoute } from "@/features/auth/server";
import { cancelPlanJobsSchema } from "@/features/plans";
import { getPlanJobsService } from "@/features/plans/server";

/** Membatalkan job AI yang sedang berjalan atau antre untuk plan → `{cancelled}` (jumlah job). */
export const POST = authedRoute({ body: cancelPlanJobsSchema }, async ({ user, body }) =>
  getPlanJobsService().cancel(user.id, body.planId),
);
