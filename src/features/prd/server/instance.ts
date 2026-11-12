import "server-only";

import { getCodebaseService } from "@/features/codebase/server";
import { getPlansService } from "@/features/plans/server";
import { getRoadmapService } from "@/features/roadmap/server";
import { getAi } from "@/server/ai";
import type { JobHandler } from "@/server/jobs";
import { getJobRunner } from "@/server/jobs";
import { getDraftStore } from "./drafts";
import { getPrdRepo } from "./repo";
import { createPrdService, PRD_JOB, PRD_REVISE_JOB, type PrdService } from "./service";

let service: PrdService | undefined;

export function getPrdService(): PrdService {
  service ??= createPrdService({
    plans: getPlansService(),
    roadmap: getRoadmapService(),
    repo: getPrdRepo(),
    ai: getAi(),
    jobs: getJobRunner(),
    drafts: getDraftStore(),
    codebaseContext: (userId, id) => getCodebaseService().contextFor(userId, id),
  });
  return service;
}

/** Handler job milik fitur PRD, dipasang oleh `instrumentation.ts`. */
export const prdJobHandlers: Record<string, JobHandler> = {
  [PRD_JOB]: (ctx) => getPrdService().runJob(ctx),
  [PRD_REVISE_JOB]: (ctx) => getPrdService().runReviseJob(ctx),
};
