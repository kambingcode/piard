import "server-only";

import {
  type DeepPartial,
  generateText,
  type LanguageModel,
  type ModelMessage,
  Output,
  streamText as sdkStreamText,
  type ToolSet,
  tool,
} from "ai";
import type { z } from "zod";
import type { AiTask, LlmConfig } from "@/server/config/env";
import type { Logger } from "@/server/logger";
import { toUpstreamError } from "./errors";
import {
  estimateTokens,
  summarizeUsage,
  type UsageEntry,
  type UsageRecorder,
  type UsageSummary,
} from "./usage";

/** Siapa yang memanggil dan untuk apa; dipakai untuk memilih model dan mencatat biaya. */
export type AiCallContext = {
  task: AiTask;
  userId: string;
  planId?: string | null;
  refId?: string | null;
};

/** Masukan model: satu prompt, atau riwayat pesan (mis. chat revisi). */
export type AiPrompt =
  | { prompt: string; messages?: never }
  | { messages: ModelMessage[]; prompt?: never };

type CommonArgs = AiCallContext &
  AiPrompt & {
    system?: string;
    abortSignal?: AbortSignal;
  };

export type GenerateStructuredArgs<T> = CommonArgs & {
  schema: z.ZodType<T>;
  /** Keluaran palsu untuk `LLM_MODE=mock`; divalidasi terhadap `schema`. */
  mock: () => T;
};

export type StreamStructuredArgs<T> = GenerateStructuredArgs<T> & {
  /**
   * Dipanggil untuk setiap objek parsial (belum divalidasi) selama model menulis. Galat yang
   * dilempar di sini menghentikan aliran dan diteruskan apa adanya (bukan `UPSTREAM_AI`).
   */
  onPartial?: (partial: DeepPartial<T>) => void | Promise<void>;
  /** Mode mock: potongan parsial yang dikirim sebelum hasil akhir, agar progres bisa diuji. */
  mockPartials?: (data: T) => DeepPartial<T>[];
  /** Mode mock: jeda antar potongan (ms) supaya kemunculan bertahap terlihat saat dev. */
  mockDelayMs?: number;
};

export type StreamTextArgs = CommonArgs & {
  /** Teks palsu untuk `LLM_MODE=mock`, dialirkan per kata. */
  mock: string;
};

/**
 * Tool yang boleh dipanggil model saat chat. `execute` dijalankan di server (bukan di klien) dan
 * hasilnya dikirim ke pemanggil sebagai event `tool`. Buat dengan {@link defineChatTool}.
 */
export type ChatTool = {
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown) => Promise<unknown>;
};

/** Membuat {@link ChatTool} bertipe; masukan divalidasi `inputSchema` sebelum `execute`. */
export function defineChatTool<I>(definition: {
  description: string;
  inputSchema: z.ZodType<I>;
  execute: (input: I) => Promise<unknown>;
}): ChatTool {
  return {
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: (input) => definition.execute(definition.inputSchema.parse(input)),
  };
}

/** Langkah palsu `LLM_MODE=mock`: teks yang dialirkan per kata, atau satu panggilan tool. */
export type MockChatStep = { text: string } | { tool: string; input: unknown };

export type StreamChatArgs = CommonArgs & {
  tools: Record<string, ChatTool>;
  /** Skenario palsu untuk `LLM_MODE=mock`; tool di dalamnya benar-benar dijalankan. */
  mock: () => MockChatStep[];
};

/** Event chat: potongan teks, atau tool yang sudah dijalankan beserta hasilnya. */
export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: unknown; output: unknown };

export type AiChatStream = {
  /** Event berurutan. Galat upstream dilempar sebagai `AppError("UPSTREAM_AI")`. */
  events: AsyncIterable<ChatEvent>;
  /** Terpenuhi setelah `events` habis dibaca. */
  completed: Promise<AiTextResult>;
};

export type AiStructuredResult<T> = { data: T; model: string; usage: UsageSummary };
export type AiTextResult = { text: string; model: string; usage: UsageSummary };

export type AiTextStream = {
  /** Potongan teks. Galat upstream dilempar sebagai `AppError("UPSTREAM_AI")`. */
  textStream: AsyncIterable<string>;
  /** Terpenuhi setelah `textStream` habis dibaca. */
  completed: Promise<AiTextResult>;
};

export type ModelFactory = (modelId: string) => LanguageModel;

export type AiClient = {
  /**
   * Menghasilkan objek yang sudah divalidasi Zod dan mencatat token serta biaya.
   * @throws {AppError} `UPSTREAM_AI` bila model gagal atau keluarannya tidak sesuai skema.
   */
  generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<AiStructuredResult<T>>;
  /**
   * Seperti `generateStructured`, tetapi mengirim objek parsial lewat `onPartial` selama model
   * menulis (mis. node roadmap muncul bertahap). Hasil akhir divalidasi penuh dengan `schema`.
   * @throws {AppError} `UPSTREAM_AI` bila model gagal atau keluarannya tidak sesuai skema.
   */
  streamStructured<T>(args: StreamStructuredArgs<T>): Promise<AiStructuredResult<T>>;
  /** Mengalirkan teks dan mencatat token serta biaya saat selesai. */
  streamText(args: StreamTextArgs): AiTextStream;
  /**
   * Chat satu langkah dengan tool: model menulis balasan dan boleh memanggil tool, yang dijalankan
   * di server. Tidak ada langkah lanjutan setelah tool (model lambat: satu panggilan cukup mahal).
   */
  streamChat(args: StreamChatArgs): AiChatStream;
};

export type AiClientDeps = {
  llm: LlmConfig;
  recordUsage: UsageRecorder;
  logger: Logger;
  /** Wajib bila `llm.mode === "openrouter"`; diganti model palsu di tes. */
  modelFactory?: ModelFactory;
  /** Dipanggil sebelum setiap panggilan model; melempar `BUDGET_EXCEEDED` bila batas biaya tercapai. */
  checkBudget?: () => void;
  /** Model untuk tugas; dibaca setiap panggilan agar model yang diganti di /settings langsung berlaku. */
  modelFor?: (task: AiTask) => string;
};

const NO_COST = 0;

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

/**
 * Tanpa `onError`, SDK mencetak galat mentah ke konsol, termasuk header respons penyedia (cookie,
 * id akun). Galat tetap sampai ke pemanggil lewat bagian `error` di `fullStream`.
 */
const silenceSdkLog = () => undefined;

/** Aliran yang langsung gagal: panggilan ditolak sebelum model dipanggil. */
// biome-ignore lint/correctness/useYield: sengaja tidak menghasilkan apa pun
async function* failWith(error: unknown): AsyncGenerator<never> {
  throw error;
}

/** Galat dari `onPartial` milik pemanggil; dibungkus agar tidak disangka galat AI. */
class PartialCallbackError {
  constructor(readonly error: unknown) {}
}

export function createAiClient({
  llm,
  recordUsage,
  logger,
  modelFactory,
  checkBudget = () => undefined,
  modelFor = (task) => llm.models[task],
}: AiClientDeps): AiClient {
  const resolveModel = (modelId: string): LanguageModel => {
    if (!modelFactory) throw new Error("modelFactory wajib untuk LLM_MODE=openrouter");
    return modelFactory(modelId);
  };

  /** Kegagalan mencatat biaya tidak boleh menggagalkan hasil AI yang sudah dibayar. */
  const record = (context: AiCallContext, model: string, summary: UsageSummary) => {
    const entry: UsageEntry = {
      userId: context.userId,
      planId: context.planId ?? null,
      task: context.task,
      refId: context.refId ?? null,
      model,
      ...summary,
    };
    try {
      recordUsage(entry);
    } catch (error) {
      logger.error("gagal mencatat pemakaian AI", { task: context.task, model, error });
    }
  };

  /** Galat penolakan sebelum model dipanggil (batas biaya), atau `undefined` bila boleh lanjut. */
  const refusal = (): unknown => {
    try {
      checkBudget();
      return undefined;
    } catch (error) {
      return error;
    }
  };

  const promptSize = (args: CommonArgs) =>
    estimateTokens(`${args.system ?? ""}${args.prompt ?? JSON.stringify(args.messages)}`);

  /** Argumen prompt untuk SDK; `AiPrompt` sudah menjamin tepat salah satu terisi. */
  const sdkPrompt = (args: CommonArgs) =>
    args.messages ? { messages: args.messages } : { prompt: args.prompt ?? "" };

  async function generateStructured<T>(
    args: GenerateStructuredArgs<T>,
  ): Promise<AiStructuredResult<T>> {
    const model = modelFor(args.task);
    checkBudget();

    if (llm.mode === "mock") {
      const data = args.schema.parse(args.mock());
      const usage = {
        inputTokens: promptSize(args),
        outputTokens: estimateTokens(JSON.stringify(data)),
        costUsd: NO_COST,
      };
      record(args, model, usage);
      return { data, model, usage };
    }

    try {
      const result = await generateText({
        model: resolveModel(model),
        system: args.system,
        ...sdkPrompt(args),
        output: Output.object({ schema: args.schema }),
        abortSignal: args.abortSignal,
      });
      const usage = summarizeUsage(model, result.usage, result.providerMetadata);
      record(args, model, usage);
      return { data: result.output, model, usage };
    } catch (error) {
      throw toUpstreamError(error, model);
    }
  }

  async function streamStructured<T>(
    args: StreamStructuredArgs<T>,
  ): Promise<AiStructuredResult<T>> {
    const model = modelFor(args.task);
    checkBudget();
    const emit = async (partial: DeepPartial<T>) => {
      try {
        await args.onPartial?.(partial);
      } catch (error) {
        throw new PartialCallbackError(error);
      }
    };

    try {
      if (llm.mode === "mock") {
        const data = args.schema.parse(args.mock());
        for (const partial of args.mockPartials?.(data) ?? []) {
          args.abortSignal?.throwIfAborted();
          if (args.mockDelayMs) await sleep(args.mockDelayMs, args.abortSignal);
          await emit(partial);
        }
        args.abortSignal?.throwIfAborted();
        await emit(data as DeepPartial<T>); // objek lengkap juga parsial yang sah
        const usage = {
          inputTokens: promptSize(args),
          outputTokens: estimateTokens(JSON.stringify(data)),
          costUsd: NO_COST,
        };
        record(args, model, usage);
        return { data, model, usage };
      }

      // Galat di tengah aliran tidak dilempar oleh partialOutputStream; ditangkap lewat onError.
      let streamError: { error: unknown } | undefined;
      const result = sdkStreamText({
        model: resolveModel(model),
        system: args.system,
        ...sdkPrompt(args),
        output: Output.object({ schema: args.schema }),
        abortSignal: args.abortSignal,
        onError: ({ error }) => {
          streamError ??= { error };
        },
      });
      for await (const partial of result.partialOutputStream) {
        await emit(partial as DeepPartial<T>);
      }
      if (streamError) throw streamError.error;
      const data = (await result.output) as T;
      const usage = summarizeUsage(
        model,
        await result.totalUsage,
        await result.providerMetadata,
      );
      record(args, model, usage);
      return { data, model, usage };
    } catch (error) {
      if (error instanceof PartialCallbackError) throw error.error;
      if (llm.mode === "mock") throw error; // fixture salah = kesalahan programmer
      throw toUpstreamError(error, model);
    }
  }

  function streamText(args: StreamTextArgs): AiTextStream {
    const model = modelFor(args.task);
    const settled = Promise.withResolvers<AiTextResult>();
    // Pemanggil yang hanya membaca stream tidak boleh memicu unhandled rejection.
    settled.promise.catch(() => undefined);
    const refused = refusal();
    if (refused) {
      settled.reject(refused);
      return { textStream: failWith(refused), completed: settled.promise };
    }

    async function* mockChunks(): AsyncGenerator<string> {
      yield* args.mock.match(/\S+\s*/g) ?? [];
      const usage = {
        inputTokens: promptSize(args),
        outputTokens: estimateTokens(args.mock),
        costUsd: NO_COST,
      };
      record(args, model, usage);
      settled.resolve({ text: args.mock, model, usage });
    }

    async function* realChunks(): AsyncGenerator<string> {
      try {
        const result = sdkStreamText({
          model: resolveModel(model),
          system: args.system,
          ...sdkPrompt(args),
          abortSignal: args.abortSignal,
          onError: silenceSdkLog,
        });
        let text = "";
        for await (const part of result.fullStream) {
          if (part.type === "error") throw part.error;
          if (part.type === "text-delta") {
            text += part.text;
            yield part.text;
          }
        }
        const usage = summarizeUsage(
          model,
          await result.totalUsage,
          await result.providerMetadata,
        );
        record(args, model, usage);
        settled.resolve({ text, model, usage });
      } catch (error) {
        const failure = toUpstreamError(error, model);
        settled.reject(failure);
        throw failure;
      }
    }

    return {
      textStream: llm.mode === "mock" ? mockChunks() : realChunks(),
      completed: settled.promise,
    };
  }

  function streamChat(args: StreamChatArgs): AiChatStream {
    const model = modelFor(args.task);
    const settled = Promise.withResolvers<AiTextResult>();
    settled.promise.catch(() => undefined);
    const refused = refusal();

    async function* mockEvents(): AsyncGenerator<ChatEvent> {
      let text = "";
      for (const step of args.mock()) {
        args.abortSignal?.throwIfAborted();
        if ("text" in step) {
          for (const word of step.text.match(/\S+\s*/g) ?? []) {
            text += word;
            yield { type: "text", text: word };
          }
          continue;
        }
        const definition = args.tools[step.tool];
        if (!definition) throw new Error(`Tool mock tidak dikenal: ${step.tool}`);
        const output = await definition.execute(step.input);
        yield { type: "tool", name: step.tool, input: step.input, output };
      }
      const usage = {
        inputTokens: promptSize(args),
        outputTokens: estimateTokens(text),
        costUsd: NO_COST,
      };
      record(args, model, usage);
      settled.resolve({ text, model, usage });
    }

    async function* realEvents(): AsyncGenerator<ChatEvent> {
      try {
        const tools: ToolSet = Object.fromEntries(
          Object.entries(args.tools).map(([name, definition]) => [
            name,
            tool({
              description: definition.description,
              inputSchema: definition.inputSchema,
              execute: (input: unknown) => definition.execute(input),
            }),
          ]),
        );
        const result = sdkStreamText({
          model: resolveModel(model),
          system: args.system,
          ...sdkPrompt(args),
          tools,
          abortSignal: args.abortSignal,
          onError: silenceSdkLog,
        });
        let text = "";
        for await (const part of result.fullStream) {
          if (part.type === "error") throw part.error;
          if (part.type === "tool-error") throw part.error;
          if (part.type === "text-delta") {
            text += part.text;
            yield { type: "text", text: part.text };
          }
          if (part.type === "tool-result") {
            yield {
              type: "tool",
              name: part.toolName,
              input: part.input,
              output: part.output,
            };
          }
        }
        const usage = summarizeUsage(
          model,
          await result.totalUsage,
          await result.providerMetadata,
        );
        record(args, model, usage);
        settled.resolve({ text, model, usage });
      } catch (error) {
        const failure = toUpstreamError(error, model);
        settled.reject(failure);
        throw failure;
      }
    }

    async function* guarded(
      source: AsyncGenerator<ChatEvent>,
    ): AsyncGenerator<ChatEvent> {
      try {
        yield* source;
      } catch (error) {
        settled.reject(error);
        throw error;
      }
    }

    return {
      events: guarded(
        refused ? failWith(refused) : llm.mode === "mock" ? mockEvents() : realEvents(),
      ),
      completed: settled.promise,
    };
  }

  return { generateStructured, streamStructured, streamText, streamChat };
}
