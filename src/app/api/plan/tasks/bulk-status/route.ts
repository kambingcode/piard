import { authedRoute } from "@/features/auth/server";
import { bulkStatusSchema } from "@/features/tasks";
import { getTasksService } from "@/features/tasks/server";

/** Mengubah status banyak task sekaligus → `{updated}`. */
export const PATCH = authedRoute({ body: bulkStatusSchema }, async ({ user, body }) =>
  getTasksService().bulkStatus(user.id, body),
);
