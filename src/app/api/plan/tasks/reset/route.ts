import { authedRoute } from "@/features/auth/server";
import { resetTasksSchema } from "@/features/tasks";
import { getTasksService } from "@/features/tasks/server";

/** Semua task plan kembali ke "todo" → `{updated}`. */
export const POST = authedRoute({ body: resetTasksSchema }, async ({ user, body }) =>
  getTasksService().resetTasks(user.id, body.planId),
);
