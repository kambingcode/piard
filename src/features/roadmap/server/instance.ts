import "server-only";

import { getCodebaseService } from "@/features/codebase/server";
import { getPlansService } from "@/features/plans/server";
import { getAi } from "@/server/ai";
import { getEnv } from "@/server/config/env";
import type { JobHandler } from "@/server/jobs";
import { getJobRunner } from "@/server/jobs";
import { getRoadmapRepo } from "./repo";
import { createRoadmapService, ROADMAP_JOB, type RoadmapService } from "./service";

/** Jeda antar fitur di mode mock agar node terlihat muncul bertahap (dev dan e2e). */
const MOCK_DELAY_MS = 350;

let service: RoadmapService | undefined;

export function getRoadmapService(): RoadmapService {
  service ??= createRoadmapService({
    plans: getPlansService(),
    repo: getRoadmapRepo(),
    ai: getAi(),
    jobs: getJobRunner(),
    mockDelayMs: getEnv().llm.mode === "mock" ? MOCK_DELAY_MS : 0,
    codebaseContext: (userId, id) => getCodebaseService().contextFor(userId, id),
  });
  return service;
}

/** Handler job milik fitur roadmap, dipasang oleh `instrumentation.ts`. */
export const roadmapJobHandlers: Record<string, JobHandler> = {
  [ROADMAP_JOB]: (ctx) => getRoadmapService().runJob(ctx),
};
