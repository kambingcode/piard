import "server-only";

import { getEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { getLogger } from "@/server/logger";
import { getAiSettings } from "@/server/settings";
import { type BudgetGuard, createBudgetGuard } from "./budget";
import { type AiClient, createAiClient } from "./client";
import { providerModelFactory } from "./providers";
import { databaseUsageRecorder } from "./usage";

export type { ModelMessage } from "ai";
export type { BudgetLimits, BudgetPeriod, BudgetStatus } from "./budget";
export type {
  AiCallContext,
  AiChatStream,
  AiClient,
  AiPrompt,
  AiStructuredResult,
  AiTextResult,
  AiTextStream,
  ChatEvent,
  ChatTool,
  GenerateStructuredArgs,
  MockChatStep,
  StreamChatArgs,
  StreamStructuredArgs,
  StreamTextArgs,
} from "./client";
export { createAiClient, defineChatTool } from "./client";
export { blocksFurtherCalls } from "./errors";
export type { UsageEntry, UsageSummary } from "./usage";
export { estimateCostUsd } from "./usage";

let cached: AiClient | undefined;
let budget: BudgetGuard | undefined;

/** Penjaga batas biaya AI proses ini (`/settings`, atau `BUDGET_DAILY_USD`/`BUDGET_MONTHLY_USD`). */
export function getBudget(): BudgetGuard {
  budget ??= createBudgetGuard({ db: getDb(), limits: () => getAiSettings().budget });
  return budget;
}

/**
 * Klien AI proses ini, dikonfigurasi dari env (`LLM_MODE`, kunci, model per tugas).
 * Semua panggilan LLM aplikasi harus lewat sini agar token dan biaya tercatat.
 */
export function getAi(): AiClient {
  if (!cached) {
    const { llm } = getEnv();
    cached = createAiClient({
      llm,
      recordUsage: databaseUsageRecorder(getDb()),
      logger: getLogger("ai"),
      modelFactory:
        llm.mode === "openrouter" ? providerModelFactory(llm.apiKeys) : undefined,
      checkBudget: () => getBudget().assertAvailable(),
      modelFor: (task) => getAiSettings().models[task],
    });
  }
  return cached;
}
