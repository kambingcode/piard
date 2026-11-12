import "server-only";

import { getCodebaseService } from "@/features/codebase/server";
import { getPlansService } from "@/features/plans/server";
import { getAi } from "@/server/ai";
import { createQuestionsService, type QuestionsService } from "./service";

let service: QuestionsService | undefined;

export function getQuestionsService(): QuestionsService {
  service ??= createQuestionsService({
    plans: getPlansService(),
    ai: getAi(),
    codebaseContext: (userId, id) => getCodebaseService().contextFor(userId, id),
  });
  return service;
}
