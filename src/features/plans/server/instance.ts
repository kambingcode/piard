import "server-only";

import { getCodebaseService } from "@/features/codebase/server";
import { getJobRunner } from "@/server/jobs";
import { createPlanJobsService, type PlanJobsService } from "./plan-jobs";
import { getPlansRepo } from "./repo";
import { createPlansService, type PlansService } from "./service";

let service: PlansService | undefined;
let jobs: PlanJobsService | undefined;

/** Service plans untuk database proses ini. */
export function getPlansService(): PlansService {
  service ??= createPlansService(getPlansRepo(), { codebases: getCodebaseService() });
  return service;
}

/** Pembatalan job AI plan (roadmap, PRD, spesifikasi & task, penyesuaian). */
export function getPlanJobsService(): PlanJobsService {
  jobs ??= createPlanJobsService({ plans: getPlansService(), jobs: getJobRunner() });
  return jobs;
}
