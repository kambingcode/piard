import "server-only";

import { getPlansService } from "@/features/plans/server";
import { getPrdService } from "@/features/prd/server";
import { getRoadmapService } from "@/features/roadmap/server";
import { getAi } from "@/server/ai";
import type { JobHandler } from "@/server/jobs";
import { getJobRunner } from "@/server/jobs";
import { getRevisionRepo } from "./repo";
import { createRevisionService, RECONCILE_JOB, type RevisionService } from "./service";

let service: RevisionService | undefined;

export function getRevisionService(): RevisionService {
  service ??= createRevisionService({
    plans: getPlansService(),
    prd: getPrdService(),
    roadmap: getRoadmapService(),
    repo: getRevisionRepo(),
    ai: getAi(),
    jobs: getJobRunner(),
  });
  return service;
}

/** Handler job milik fitur revisi, dipasang oleh `instrumentation.ts`. */
export const revisionJobHandlers: Record<string, JobHandler> = {
  [RECONCILE_JOB]: (ctx) => getRevisionService().runReconcileJob(ctx),
};
