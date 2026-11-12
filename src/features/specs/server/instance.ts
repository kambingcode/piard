import "server-only";

import { getCodebaseService } from "@/features/codebase/server";
import { getPlansService } from "@/features/plans/server";
import { getPrdService } from "@/features/prd/server";
import { getRoadmapService } from "@/features/roadmap/server";
import { getTasksService } from "@/features/tasks/server";
import { getAi } from "@/server/ai";
import type { JobHandler } from "@/server/jobs";
import { getJobRunner } from "@/server/jobs";
import {
  BUILD_JOB,
  createSpecsService,
  FEATURE_TASKS_JOB,
  type SpecsService,
  SYNC_TASKS_JOB,
} from "./service";

let service: SpecsService | undefined;

export function getSpecsService(): SpecsService {
  service ??= createSpecsService({
    plans: getPlansService(),
    roadmap: getRoadmapService(),
    prd: getPrdService(),
    tasks: getTasksService(),
    ai: getAi(),
    jobs: getJobRunner(),
    codebaseContext: (userId, id) => getCodebaseService().contextFor(userId, id),
  });
  return service;
}

/** Handler job milik fitur spesifikasi, dipasang oleh `instrumentation.ts`. */
export const specsJobHandlers: Record<string, JobHandler> = {
  [BUILD_JOB]: (ctx) => getSpecsService().runBuildJob(ctx),
  [FEATURE_TASKS_JOB]: (ctx) => getSpecsService().runFeatureTasksJob(ctx),
  [SYNC_TASKS_JOB]: (ctx) => getSpecsService().runSyncTasksJob(ctx),
};
