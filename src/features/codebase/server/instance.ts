import "server-only";

import { getAi, getBudget } from "@/server/ai";
import { getEnv } from "@/server/config/env";
import { getJobRunner, type JobHandler } from "@/server/jobs";
import { getAiSettings } from "@/server/settings";
import { type AgentService, createAgentService } from "./agent";
import { ANALYZE_JOB, type AnalysisService, createAnalysisService } from "./analyze";
import { getCodebaseRepo } from "./repo";
import { type CodebaseService, createCodebaseService } from "./service";
import { createSourceStore } from "./source-store";

let service: CodebaseService | undefined;
let store: ReturnType<typeof createSourceStore> | undefined;

/** Satu penyimpanan sumber sementara untuk semua service fitur ini. */
function sourceStore() {
  store ??= createSourceStore(getEnv().codebase.sourceDir);
  return store;
}

/** Service codebase untuk database dan folder sumber sementara proses ini. */
export function getCodebaseService(): CodebaseService {
  if (!service) {
    const { codebase } = getEnv();
    service = createCodebaseService(getCodebaseRepo(), {
      store: sourceStore(),
      maxUploadBytes: codebase.maxUploadBytes,
      cancelJob: (jobId) => {
        getJobRunner().cancel(jobId);
      },
    });
  }
  return service;
}

let agent: AgentService | undefined;

/** Service jalur agen (token dan kiriman), berbagi aturan kepemilikan dengan service codebase. */
export function getAgentService(): AgentService {
  if (!agent) {
    const codebase = getCodebaseService();
    agent = createAgentService(getCodebaseRepo(), {
      own: codebase.own,
      appUrl: getEnv().appUrl,
    });
  }
  return agent;
}

let analysis: AnalysisService | undefined;

/** Analisis server (perkiraan biaya, job `codebase-analyze`, status). */
export function getAnalysisService(): AnalysisService {
  if (!analysis) {
    const codebase = getCodebaseService();
    analysis = createAnalysisService({
      repo: getCodebaseRepo(),
      store: sourceStore(),
      ai: getAi(),
      jobs: getJobRunner(),
      // Dibaca per panggilan: model bisa diganti di /settings tanpa mulai ulang (ADR 0013).
      model: () => getAiSettings().models.codebase,
      budget: () => getBudget().status(),
      own: codebase.own,
    });
  }
  return analysis;
}

/** Handler job milik fitur codebase, dipasang oleh `instrumentation.ts`. */
export const codebaseJobHandlers: Record<string, JobHandler> = {
  [ANALYZE_JOB]: (ctx) => getAnalysisService().run(ctx),
};
