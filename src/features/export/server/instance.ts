import "server-only";

import { getCodebaseService } from "@/features/codebase/server";
import { getPlansService } from "@/features/plans/server";
import { getPrdService } from "@/features/prd/server";
import { getRoadmapService } from "@/features/roadmap/server";
import { getTasksService } from "@/features/tasks/server";
import { createExportService, type ExportService } from "./service";

let service: ExportService | undefined;

export function getExportService(): ExportService {
  service ??= createExportService({
    plans: getPlansService(),
    prd: getPrdService(),
    roadmap: getRoadmapService(),
    tasks: getTasksService(),
    codebaseFiles: (userId, codebaseId) =>
      getCodebaseService().docFiles(userId, codebaseId),
  });
  return service;
}
