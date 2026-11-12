import { authedRoute } from "@/features/auth/server";
import { buildQuerySchema } from "@/features/specs";
import { getSpecsService } from "@/features/specs/server";

/** "Sesuaikan task": menyusun ulang spesifikasi & task fitur yang berubah → `{status}`. */
export const POST = authedRoute({ body: buildQuerySchema }, async ({ user, body }) =>
  getSpecsService().startSyncTasks(user.id, body.planId),
);
