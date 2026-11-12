import { authedRoute } from "@/features/auth/server";
import { getPlansService } from "@/features/plans/server";

/** Plan milik pengguna, yang terakhir diubah paling atas. */
export const GET = authedRoute({}, async ({ user }) => ({
  plans: getPlansService().listPlans(user.id),
}));
