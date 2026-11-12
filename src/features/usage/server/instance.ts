import "server-only";

import { getBudget } from "@/server/ai";
import { getUsageRepo } from "./repo";
import { createUsageService, type UsageService } from "./service";

let service: UsageService | undefined;

export function getUsageService(): UsageService {
  service ??= createUsageService({
    repo: getUsageRepo(),
    budget: () => getBudget().status(),
  });
  return service;
}
