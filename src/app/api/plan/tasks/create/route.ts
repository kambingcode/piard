import { authedRoute } from "@/features/auth/server";
import { createTaskSchema } from "@/features/tasks";
import { getTasksService } from "@/features/tasks/server";

/** Task buatan pengguna di akhir daftar fiturnya → `{task}`. */
export const POST = authedRoute({ body: createTaskSchema }, async ({ user, body }) => ({
  task: getTasksService().createTask(user.id, body),
}));
