import "server-only";

import type { LanguageModelUsage, ProviderMetadata } from "ai";
import { type AiTask, isAnthropicModel } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { usage } from "@/server/db/schema";

/** Satu panggilan LLM yang dicatat ke tabel `usage`. */
export type UsageEntry = {
  userId: string;
  planId: string | null;
  task: AiTask;
  refId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type UsageSummary = Pick<UsageEntry, "inputTokens" | "outputTokens" | "costUsd">;

export type UsageRecorder = (entry: UsageEntry) => void;

/** Perkiraan kasar untuk mode mock: satu token ≈ 4 karakter. */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Pencatat yang menulis ke database. */
export function databaseUsageRecorder(db: Db): UsageRecorder {
  return (entry) => {
    db.insert(usage)
      .values({
        userId: entry.userId,
        planId: entry.planId,
        kind: entry.task,
        refId: entry.refId,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd,
      })
      .run();
  };
}

/** Membaca biaya USD dari metadata OpenRouter; 0 bila tidak dilaporkan. */
export function extractCostUsd(metadata: ProviderMetadata | undefined): number {
  const cost = metadata?.openrouter?.usage;
  if (typeof cost !== "object" || cost === null || !("cost" in cost)) return 0;
  return typeof cost.cost === "number" && Number.isFinite(cost.cost) && cost.cost >= 0
    ? cost.cost
    : 0;
}

type Price = { inputPerMillion: number; outputPerMillion: number };
type AnthropicPrice = Price & { longContext?: Price & { aboveInputTokens: number } };

/**
 * Harga API Anthropic per juta token (USD, 2026-10). API Anthropic tidak melaporkan biaya seperti
 * OpenRouter, jadi dihitung dari token. Perbarui bila harga berubah; model tak dikenal dicatat 0.
 */
const ANTHROPIC_PRICES: Record<string, AnthropicPrice> = {
  "claude-haiku-5-5": {
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    longContext: {
      aboveInputTokens: 100_000,
      inputPerMillion: 0.5,
      outputPerMillion: 2.5,
    },
  },
  "claude-sonnet-5-5": { inputPerMillion: 2, outputPerMillion: 10 },
  "claude-opus-5-5": { inputPerMillion: 4, outputPerMillion: 20 },
};

const TOKENS_PER_MILLION = 1_000_000;

/** Biaya panggilan langsung ke Anthropic, dihitung dari jumlah token dan tabel harga. */
export function anthropicCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const base = ANTHROPIC_PRICES[model];
  if (!base) return 0;
  const long = base.longContext;
  const price = long && inputTokens > long.aboveInputTokens ? long : base;
  return (
    (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) /
    TOKENS_PER_MILLION
  );
}

/**
 * Perkiraan biaya sebelum menjalankan (M7-12): dijumlahkan per panggilan karena tarif konteks panjang
 * berlaku per panggilan. Model mock = 0; model OpenRouter = null (harganya baru diketahui dari respons).
 */
export function estimateCostUsd(
  model: string,
  calls: readonly { inputTokens: number; outputTokens: number }[],
): number | null {
  if (model.startsWith("mock/")) return 0;
  if (!isAnthropicModel(model) || !ANTHROPIC_PRICES[model]) return null;
  return calls.reduce(
    (sum, call) => sum + anthropicCostUsd(model, call.inputTokens, call.outputTokens),
    0,
  );
}

export function summarizeUsage(
  model: string,
  modelUsage: LanguageModelUsage,
  metadata: ProviderMetadata | undefined,
): UsageSummary {
  const inputTokens = modelUsage.inputTokens ?? 0;
  const outputTokens = modelUsage.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    costUsd: isAnthropicModel(model)
      ? anthropicCostUsd(model, inputTokens, outputTokens)
      : extractCostUsd(metadata),
  };
}
