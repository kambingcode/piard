import "server-only";

import { isAnthropicModel, mapTasks } from "@/lib/ai-models";
import type { Env } from "@/server/config/env";
import { ValidationError } from "@/server/http/errors";
import {
  type AiSettingsOverrides,
  effectiveAiSettings,
  type SettingsStore,
} from "@/server/settings";
import { settingsCopy } from "../copy";
import { AI_TASKS, type SettingsView, type UpdateSettingsInput } from "../schemas";

type Deps = { env: () => Env; store: SettingsStore };

/**
 * Pengaturan AI global (aplikasi hanya punya satu pemilik). Yang disimpan hanya nilai yang berbeda dari
 * `.env`, sehingga perubahan `.env` untuk nilai yang tidak diubah di sini tetap berlaku.
 */
export function createSettingsService({ env, store }: Deps) {
  function view(): SettingsView {
    const current = env();
    const overrides = store.overrides();
    const effective = effectiveAiSettings(current, overrides);
    const models = mapTasks((task) => ({
      value: effective.models[task],
      envValue: current.llm.models[task],
      overridden: effective.models[task] !== current.llm.models[task],
    }));
    // Kedua batas disimpan bersama, tetapi hanya yang nilainya berbeda dari `.env` yang ditandai.
    const limit = (key: "dailyUsd" | "monthlyUsd") => ({
      value: effective.budget[key],
      envValue: current.budget[key],
      overridden: effective.budget[key] !== current.budget[key],
    });
    return {
      mode: current.llm.mode,
      models,
      budget: { dailyUsd: limit("dailyUsd"), monthlyUsd: limit("monthlyUsd") },
      keys: current.keysSet,
    };
  }

  /** Model yang penyedianya tidak punya kunci pasti gagal; tolak sebelum disimpan. */
  function assertCallable(current: Env, input: UpdateSettingsInput): void {
    if (current.llm.mode !== "openrouter") return;
    const { apiKeys } = current.llm;
    const issues = AI_TASKS.flatMap((task) => {
      const model = input.models[task];
      const missing = isAnthropicModel(model)
        ? apiKeys.anthropic === null && "ANTHROPIC_API_KEY"
        : apiKeys.openrouter === null && "OPENROUTER_API_KEY";
      return missing
        ? [{ path: `models.${task}`, message: settingsCopy.errors.missingKey(missing) }]
        : [];
    });
    const first = issues[0];
    if (first) throw new ValidationError(first.message, issues);
  }

  return {
    getSettings: view,

    /** @throws {ValidationError} bila model memakai penyedia yang kuncinya belum diisi. */
    updateSettings(input: UpdateSettingsInput): SettingsView {
      const current = env();
      assertCallable(current, input);
      const models: Partial<Record<string, string>> = {};
      for (const task of AI_TASKS) {
        if (input.models[task] !== current.llm.models[task])
          models[task] = input.models[task];
      }
      const sameBudget =
        input.budget.dailyUsd === current.budget.dailyUsd &&
        input.budget.monthlyUsd === current.budget.monthlyUsd;
      const next: AiSettingsOverrides = {
        ...(Object.keys(models).length > 0 ? { models } : {}),
        ...(sameBudget ? {} : { budget: input.budget }),
      };
      if (Object.keys(next).length === 0) store.clear();
      else store.save(next);
      return view();
    },

    resetSettings(): SettingsView {
      store.clear();
      return view();
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
