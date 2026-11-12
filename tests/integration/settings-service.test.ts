import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createSettingsService } from "@/features/settings/server";
import { AI_TASKS } from "@/lib/ai-models";
import { createAiClient } from "@/server/ai/client";
import { databaseUsageRecorder } from "@/server/ai/usage";
import { type Env, parseEnv } from "@/server/config/env";
import type { DbHandle } from "@/server/db/client";
import { usage } from "@/server/db/schema";
import { ValidationError } from "@/server/http/errors";
import { createLogger } from "@/server/logger";
import { createSettingsStore, effectiveAiSettings } from "@/server/settings";
import { createTestDb, seedUser } from "../helpers/test-db";

const models = {
  MODEL_QUESTIONS: "v/q",
  MODEL_ROADMAP: "v/r",
  MODEL_PRD: "v/p",
  MODEL_SPEC: "v/s",
  MODEL_TASKS: "v/t",
  MODEL_CHAT: "v/c",
  MODEL_CODEBASE: "v/cb",
};
const openrouterOnly = parseEnv({
  LLM_MODE: "openrouter",
  OPENROUTER_API_KEY: "sk-or",
  BUDGET_MONTHLY_USD: "10",
  ...models,
});

let handle: DbHandle;
beforeEach(() => {
  handle = createTestDb();
});
afterEach(() => handle.close());

function setup(env: Env = openrouterOnly) {
  const store = createSettingsStore(handle.db);
  return { store, service: createSettingsService({ env: () => env, store }) };
}

const sameAsEnv = {
  models: {
    questions: "v/q",
    roadmap: "v/r",
    prd: "v/p",
    spec: "v/s",
    tasks: "v/t",
    chat: "v/c",
    codebase: "v/cb",
  },
  budget: { dailyUsd: null, monthlyUsd: 10 },
};

describe("pengaturan AI", () => {
  it("tanpa pengaturan tersimpan, nilai .env berlaku dan tidak ada yang ditandai diubah", () => {
    const view = setup().service.getSettings();
    expect(view.mode).toBe("openrouter");
    expect(view.models.prd).toEqual({ value: "v/p", envValue: "v/p", overridden: false });
    expect(view.budget.monthlyUsd).toEqual({
      value: 10,
      envValue: 10,
      overridden: false,
    });
    expect(view.keys).toEqual({ openrouter: true, anthropic: false });
  });

  it("hanya menyimpan nilai yang berbeda dari .env", () => {
    const { store, service } = setup();
    const view = service.updateSettings({
      ...sameAsEnv,
      models: { ...sameAsEnv.models, prd: "v/lain" },
      budget: { dailyUsd: 1, monthlyUsd: 10 },
    });
    expect(store.overrides()).toEqual({
      models: { prd: "v/lain" },
      budget: { dailyUsd: 1, monthlyUsd: 10 },
    });
    expect(view.models.prd).toMatchObject({ value: "v/lain", overridden: true });
    expect(view.models.chat.overridden).toBe(false);
    expect(view.budget.dailyUsd).toMatchObject({
      value: 1,
      envValue: null,
      overridden: true,
    });
    // Disimpan bersama, tetapi batas bulanan yang sama dengan .env tidak ditandai diubah.
    expect(view.budget.monthlyUsd).toMatchObject({ value: 10, overridden: false });
  });

  it("menyimpan nilai yang sama dengan .env berarti tidak ada pengaturan tersimpan", () => {
    const { store, service } = setup();
    service.updateSettings({
      ...sameAsEnv,
      models: { ...sameAsEnv.models, prd: "v/lain" },
    });
    service.updateSettings(sameAsEnv);
    expect(store.overrides()).toEqual({});
  });

  it("tanpa batas (null) bisa menimpa batas .env", () => {
    const { service } = setup();
    const view = service.updateSettings({
      ...sameAsEnv,
      budget: { dailyUsd: null, monthlyUsd: null },
    });
    expect(view.budget.monthlyUsd).toEqual({
      value: null,
      envValue: 10,
      overridden: true,
    });
    expect(effectiveAiSettings(openrouterOnly, setup().store.overrides()).budget).toEqual(
      {
        dailyUsd: null,
        monthlyUsd: null,
      },
    );
  });

  it("menolak model claude-* bila ANTHROPIC_API_KEY belum diisi, dengan galat per kolom", () => {
    const { store, service } = setup();
    let error: unknown;
    try {
      service.updateSettings({
        ...sameAsEnv,
        models: { ...sameAsEnv.models, spec: "claude-haiku-5-5" },
      });
    } catch (caught) {
      error = caught;
    }
    if (!(error instanceof ValidationError)) throw new Error("bukan ValidationError");
    expect(error.issues).toEqual([
      { path: "models.spec", message: expect.stringContaining("ANTHROPIC_API_KEY") },
    ]);
    expect(store.overrides()).toEqual({});
  });

  it("mode mock menerima model apa pun (hanya label) dan tetap melaporkan kunci yang terisi", () => {
    const mock = parseEnv({ ANTHROPIC_API_KEY: "sk-ant" });
    const { service } = setup(mock);
    const view = service.updateSettings({
      models: { ...sameAsEnv.models, spec: "claude-haiku-5-5" },
      budget: { dailyUsd: null, monthlyUsd: null },
    });
    expect(view.mode).toBe("mock");
    expect(view.models.spec.value).toBe("claude-haiku-5-5");
    expect(view.keys).toEqual({ openrouter: false, anthropic: true });
  });

  it("reset menghapus semua pengaturan tersimpan", () => {
    const { store, service } = setup();
    service.updateSettings({
      ...sameAsEnv,
      models: { ...sameAsEnv.models, prd: "v/lain" },
    });
    const view = service.resetSettings();
    expect(store.overrides()).toEqual({});
    expect(AI_TASKS.every((task) => !view.models[task].overridden)).toBe(true);
  });

  it("salinan modul lain (penyimpanan lain atas database yang sama) langsung melihat perubahan", () => {
    const reader = createSettingsStore(handle.db);
    expect(reader.overrides()).toEqual({});
    setup().service.updateSettings({
      ...sameAsEnv,
      models: { ...sameAsEnv.models, chat: "v/chat-baru" },
    });
    expect(reader.overrides()).toEqual({ models: { chat: "v/chat-baru" } });
    setup().store.clear();
    expect(reader.overrides()).toEqual({});
  });

  it("pengaturan bertahan di database (penyimpanan baru membaca nilai yang sama)", () => {
    setup().service.updateSettings({
      ...sameAsEnv,
      models: { ...sameAsEnv.models, roadmap: "v/baru" },
    });
    expect(createSettingsStore(handle.db).overrides()).toEqual({
      models: { roadmap: "v/baru" },
    });
  });
});

describe("model yang diganti berlaku pada panggilan berikutnya", () => {
  it("klien AI membaca model dari pengaturan di setiap panggilan", async () => {
    const userId = seedUser(handle.db).id;
    const mockEnv = parseEnv({});
    const { store, service } = setup(mockEnv);
    const ai = createAiClient({
      llm: mockEnv.llm,
      logger: createLogger({ level: "silent", sink: () => undefined }),
      recordUsage: databaseUsageRecorder(handle.db),
      modelFor: (task) => effectiveAiSettings(mockEnv, store.overrides()).models[task],
    });
    const call = () =>
      ai.generateStructured({
        task: "prd",
        userId,
        prompt: "p",
        schema: z.object({ n: z.number() }),
        mock: () => ({ n: 1 }),
      });

    expect((await call()).model).toBe("mock/prd");
    service.updateSettings({
      models: { ...mockEnv.llm.models, prd: "vendor/baru" },
      budget: { dailyUsd: null, monthlyUsd: null },
    });
    expect((await call()).model).toBe("vendor/baru");
    expect(
      handle.db
        .select()
        .from(usage)
        .all()
        .map((row) => row.model),
    ).toEqual(["mock/prd", "vendor/baru"]);
  });
});
