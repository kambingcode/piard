import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isAnthropicModel, type LlmKeys } from "@/server/config/env";
import type { ModelFactory } from "./client";

/**
 * Memilih penyedia per model: ID `claude-*` langsung ke API Anthropic, sisanya ke OpenRouter
 * (dengan pelaporan biaya diaktifkan, dibaca dari `providerMetadata`).
 */
export function providerModelFactory(apiKeys: LlmKeys): ModelFactory {
  const openRouter = apiKeys.openrouter
    ? createOpenRouter({ apiKey: apiKeys.openrouter })
    : undefined;
  const anthropic = apiKeys.anthropic
    ? createAnthropic({ apiKey: apiKeys.anthropic })
    : undefined;

  return (modelId) => {
    if (isAnthropicModel(modelId)) {
      if (!anthropic) throw new Error(`ANTHROPIC_API_KEY belum diisi untuk ${modelId}`);
      return anthropic(modelId);
    }
    if (!openRouter) throw new Error(`OPENROUTER_API_KEY belum diisi untuk ${modelId}`);
    return openRouter(modelId, { usage: { include: true } });
  };
}
