import "server-only";

import { getPlansService } from "@/features/plans/server";
import { getTasksRepo } from "./repo";
import { createTasksService, type TasksService } from "./service";

let service: TasksService | undefined;

export function getTasksService(): TasksService {
  service ??= createTasksService({ plans: getPlansService(), repo: getTasksRepo() });
  return service;
}
