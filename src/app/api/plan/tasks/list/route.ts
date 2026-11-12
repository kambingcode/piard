import { authedRoute } from "@/features/auth/server";
import { taskListQuerySchema } from "@/features/tasks";
import { getTasksService } from "@/features/tasks/server";

/** `{tasks}` satu plan, opsional satu fitur; urut fitur lalu posisi. */
export const GET = authedRoute(
  { query: taskListQuerySchema },
  async ({ user, query }) => ({
    tasks: getTasksService().listTasks(user.id, query.planId, query.featureId),
  }),
);
