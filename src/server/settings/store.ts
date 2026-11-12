import "server-only";

import { eq } from "drizzle-orm";
import { AI_TASKS, type AiTask, type BudgetLimits, type Env } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import type { AiSettingsOverrides } from "@/server/db/json-types";
import { appSettings } from "@/server/db/schema";

export type { AiSettingsOverrides };

/** Pengaturan AI yang berlaku: `.env` ditimpa pengaturan yang disimpan lewat /settings. */
export type AiSettings = { models: Record<AiTask, string>; budget: BudgetLimits };

export type SettingsStore = {
  /** Pengaturan tersimpan (bagian yang tidak ada memakai `.env`). */
  overrides(): AiSettingsOverrides;
  save(next: AiSettingsOverrides): void;
  /** Menghapus semua pengaturan tersimpan sehingga `.env` berlaku lagi. */
  clear(): void;
};

const AI_KEY = "ai";

/**
 * Penyimpanan pengaturan di tabel `app_settings`. Sengaja tanpa cache memori: build produksi Next bisa
 * memuat modul ini lebih dari sekali (route handler, halaman, dan runner job di instrumentation), dan
 * cache per salinan modul basi setelah salinan lain menulis. Satu baris per primary key murah
 * dibanding panggilan model.
 */
export function createSettingsStore(db: Db): SettingsStore {
  return {
    overrides() {
      return (
        db.select().from(appSettings).where(eq(appSettings.key, AI_KEY)).get()?.value ??
        {}
      );
    },

    save(next) {
      db.insert(appSettings)
        .values({ key: AI_KEY, value: next })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: next, updatedAt: new Date() },
        })
        .run();
    },

    clear() {
      db.delete(appSettings).where(eq(appSettings.key, AI_KEY)).run();
    },
  };
}

/** Model per tugas dan batas biaya yang berlaku. */
export function effectiveAiSettings(
  env: Env,
  overrides: AiSettingsOverrides,
): AiSettings {
  const models = { ...env.llm.models };
  for (const task of AI_TASKS) {
    const chosen = overrides.models?.[task];
    if (chosen) models[task] = chosen;
  }
  return { models, budget: overrides.budget ?? env.budget };
}
