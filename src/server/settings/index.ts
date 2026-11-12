import "server-only";

import { getEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import {
  type AiSettings,
  createSettingsStore,
  effectiveAiSettings,
  type SettingsStore,
} from "./store";

export type { AiSettings, AiSettingsOverrides, SettingsStore } from "./store";
export { createSettingsStore, effectiveAiSettings } from "./store";

let store: SettingsStore | undefined;

/** Penyimpanan pengaturan proses ini. */
export function getSettingsStore(): SettingsStore {
  store ??= createSettingsStore(getDb());
  return store;
}

/** Pengaturan AI yang berlaku saat ini; dibaca setiap panggilan model sehingga perubahan langsung berlaku. */
export function getAiSettings(): AiSettings {
  return effectiveAiSettings(getEnv(), getSettingsStore().overrides());
}
