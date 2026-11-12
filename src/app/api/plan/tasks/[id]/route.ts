import { authedRoute } from "@/features/auth/server";
import { patchTaskSchema, taskIdParamsSchema } from "@/features/tasks";
import { getTasksService } from "@/features/tasks/server";

const params = taskIdParamsSchema;

/** Mengubah task (judul, deskripsi, prompt, status, posisi) → `{task}`. */
export const PATCH = authedRoute(
  { params, body: patchTaskSchema },
  async ({ user, params: { id }, body }) => ({
    task: getTasksService().updateTask(user.id, id, body),
  }),
);

/** Menghapus task → `{ok: true}`. */
export const DELETE = authedRoute({ params }, async ({ user, params: { id } }) => {
  getTasksService().deleteTask(user.id, id);
  return { ok: true };
});
