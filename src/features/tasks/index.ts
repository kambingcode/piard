/** API publik fitur tasks yang aman untuk klien: skema, tipe, teks, dan komponen. */

export { KanbanBoard, type KanbanSlots } from "./components/kanban-board";
export { tasksCopy } from "./copy";
export {
  BULK_MAX,
  type BulkStatusInput,
  bulkStatusSchema,
  type CreateTaskInput,
  createTaskSchema,
  DESCRIPTION_MAX_LENGTH,
  type PatchTaskInput,
  PROMPT_MAX_LENGTH,
  patchTaskSchema,
  resetTasksSchema,
  TASK_STATUSES,
  type Task,
  type TaskDraft,
  type TaskStatus,
  TITLE_MAX_LENGTH,
  taskIdParamsSchema,
  taskListQuerySchema,
  taskSchema,
} from "./schemas";
