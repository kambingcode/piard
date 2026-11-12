import "server-only";

import { getEnv } from "@/server/config/env";
import { getSettingsStore } from "@/server/settings";
import { createSettingsService, type SettingsService } from "./service";

let service: SettingsService | undefined;

export function getSettingsService(): SettingsService {
  service ??= createSettingsService({ env: getEnv, store: getSettingsStore() });
  return service;
}
