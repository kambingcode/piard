import { APICallError, RetryError, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { desc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type AiClient,
  type ChatEvent,
  createAiClient,
  defineChatTool,
} from "@/server/ai/client";
import { databaseUsageRecorder } from "@/server/ai/usage";
import type { LlmConfig } from "@/server/config/env";
import type { DbHandle } from "@/server/db/client";
import { usage } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createLogger } from "@/server/logger";
import { createTestDb, seedUser } from "../helpers/test-db";

const mockLlm: LlmConfig = {
  mode: "mock",
  models: {
    questions: "mock/questions",
    roadmap: "mock/roadmap",
    prd: "mock/prd",
    spec: "mock/spec",
    tasks: "mock/tasks",
    chat: "mock/chat",
    codebase: "mock/codebase",
  },
};
const realLlm: LlmConfig = {
  mode: "openrouter",
  apiKeys: { openrouter: "sk-test", anthropic: "sk-ant-test" },
  models: {
    questions: "v/q",
    roadmap: "v/r",
    prd: "v/p",
    spec: "v/s",
    tasks: "v/t",
    chat: "v/c",
    codebase: "v/cb",
  },
};

const logger = createLogger({ level: "silent", sink: () => undefined });
const Answer = z.object({ title: z.string(), n: z.number() });

let handle: DbHandle;
let userId: string;

beforeEach(() => {
  handle = createTestDb();
  userId = seedUser(handle.db).id;
});
afterEach(() => handle.close());

const usageRows = () =>
  handle.db.select().from(usage).orderBy(desc(usage.createdAt)).all();

function clientFor(llm: LlmConfig, model?: MockLanguageModelV4): AiClient {
  return createAiClient({
    llm,
    logger,
    recordUsage: databaseUsageRecorder(handle.db),
    modelFactory: model ? () => model : undefined,
  });
}

const finishUsage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 30, text: 30, reasoning: undefined },
};

function generating(text: string, cost?: number) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: finishUsage,
      warnings: [],
      providerMetadata:
        cost === undefined ? undefined : { openrouter: { usage: { cost } } },
    }),
  });
}

describe("mode mock", () => {
  it("mengembalikan fixture tervalidasi tanpa model dan mencatat pemakaian", async () => {
    const ai = clientFor(mockLlm);
    const result = await ai.generateStructured({
      task: "questions",
      userId,
      prompt: "ide toko roti",
      schema: Answer,
      mock: () => ({ title: "Toko Roti", n: 5 }),
    });
    expect(result.data).toEqual({ title: "Toko Roti", n: 5 });
    expect(result.model).toBe("mock/questions");
    expect(result.usage.costUsd).toBe(0);
    expect(usageRows()).toMatchObject([
      { userId, kind: "questions", model: "mock/questions", costUsd: 0, planId: null },
    ]);
    expect(usageRows()[0]?.inputTokens).toBeGreaterThan(0);
  });

  it("deterministik: dua panggilan memberi hasil dan hitungan sama", async () => {
    const ai = clientFor(mockLlm);
    const run = () =>
      ai.generateStructured({
        task: "roadmap",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: "x", n: 1 }),
      });
    expect(await run()).toEqual(await run());
  });

  it("menolak fixture yang melanggar skema (kesalahan programmer, bukan UPSTREAM_AI)", async () => {
    const ai = clientFor(mockLlm);
    await expect(
      ai.generateStructured({
        task: "roadmap",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: 1, n: "a" }) as never,
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("menyimpan planId dan refId pada catatan pemakaian", async () => {
    const ai = clientFor(mockLlm);
    const plan = await seedPlanFor(userId);
    await ai.generateStructured({
      task: "prd",
      userId,
      planId: plan,
      refId: "job-1",
      prompt: "p",
      schema: Answer,
      mock: () => ({ title: "x", n: 1 }),
    });
    expect(usageRows()[0]).toMatchObject({ planId: plan, refId: "job-1" });
  });

  it("mengalirkan teks per kata dan menyelesaikan completed", async () => {
    const ai = clientFor(mockLlm);
    const { textStream, completed } = ai.streamText({
      task: "prd",
      userId,
      prompt: "tulis PRD",
      mock: "# PRD\n\nIsi dokumen singkat.",
    });
    const chunks: string[] = [];
    for await (const chunk of textStream) chunks.push(chunk);

    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join("")).toBe("# PRD\n\nIsi dokumen singkat.");
    const done = await completed;
    expect(done.text).toBe("# PRD\n\nIsi dokumen singkat.");
    expect(usageRows()).toMatchObject([{ kind: "prd", model: "mock/prd" }]);
  });

  it("menerima riwayat pesan sebagai masukan", async () => {
    const ai = clientFor(mockLlm);
    const { textStream } = ai.streamText({
      task: "chat",
      userId,
      messages: [{ role: "user", content: "halo" }],
      mock: "hai",
    });
    for await (const _ of textStream) {
      // dihabiskan
    }
    expect(usageRows()[0]?.inputTokens).toBeGreaterThan(0);
  });
});

describe("mode openrouter (model palsu)", () => {
  it("memparse keluaran, memakai model dari env, dan mencatat token serta biaya", async () => {
    const model = generating(JSON.stringify({ title: "Klinik", n: 7 }), 0.0123);
    const ai = clientFor(realLlm, model);
    const result = await ai.generateStructured({
      task: "roadmap",
      userId,
      prompt: "ide",
      schema: Answer,
      mock: () => ({ title: "tidak dipakai", n: 0 }),
    });
    expect(result.data).toEqual({ title: "Klinik", n: 7 });
    expect(result.model).toBe("v/r");
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30, costUsd: 0.0123 });
    expect(usageRows()).toMatchObject([
      {
        kind: "roadmap",
        model: "v/r",
        inputTokens: 120,
        outputTokens: 30,
        costUsd: 0.0123,
      },
    ]);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("mencatat biaya 0 bila OpenRouter tidak melaporkannya", async () => {
    const ai = clientFor(realLlm, generating(JSON.stringify({ title: "a", n: 1 })));
    const result = await ai.generateStructured({
      task: "roadmap",
      userId,
      prompt: "p",
      schema: Answer,
      mock: () => ({ title: "a", n: 1 }),
    });
    expect(result.usage.costUsd).toBe(0);
  });

  it("menghitung biaya model Anthropic langsung dari token dan tabel harga", async () => {
    const ai = clientFor(
      { ...realLlm, models: { ...realLlm.models, roadmap: "claude-haiku-5-5" } },
      generating(JSON.stringify({ title: "a", n: 1 })),
    );
    const result = await ai.generateStructured({
      task: "roadmap",
      userId,
      prompt: "p",
      schema: Answer,
      mock: () => ({ title: "a", n: 1 }),
    });
    // 120 token masuk × $0,10/jt + 30 token keluar × $0,50/jt
    expect(result.usage.costUsd).toBeCloseTo(0.000027, 9);
    expect(usageRows()[0]).toMatchObject({ model: "claude-haiku-5-5" });
  });

  it("galat kunci dari Anthropic menyebut ANTHROPIC_API_KEY", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "unauthorized",
          url: "https://api.anthropic.com/v1/messages",
          requestBodyValues: {},
          statusCode: 401,
          isRetryable: false,
        });
      },
    });
    const ai = clientFor(
      { ...realLlm, models: { ...realLlm.models, questions: "claude-haiku-5-5" } },
      model,
    );
    const error = await ai
      .generateStructured({
        task: "questions",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: "a", n: 1 }),
      })
      .catch((e: unknown) => e);
    expect((error as AppError).message).toBe(
      "Anthropic menolak kunci API. Periksa ANTHROPIC_API_KEY di .env.",
    );
  });

  it("memetakan keluaran yang bukan JSON sesuai skema menjadi UPSTREAM_AI", async () => {
    const ai = clientFor(realLlm, generating("bukan json"));
    const error = await ai
      .generateStructured({
        task: "roadmap",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: "a", n: 1 }),
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "UPSTREAM_AI", status: 502 });
    expect(usageRows()).toHaveLength(0);
  });

  it.each([
    [401, /kunci API/],
    [402, /Saldo/],
    [429, /membatasi/],
    [500, /bermasalah/],
  ])("memetakan HTTP %i dari OpenRouter menjadi pesan yang bisa ditindaklanjuti", async (statusCode, message) => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "upstream",
          url: "https://openrouter.ai/api/v1/chat/completions",
          requestBodyValues: {},
          statusCode,
          isRetryable: false,
        });
      },
    });
    const ai = clientFor(realLlm, model);
    const error = await ai
      .generateStructured({
        task: "questions",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: "a", n: 1 }),
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).toMatch(message);
    expect((error as AppError).code).toBe("UPSTREAM_AI");
  });

  it("galat 400 dari OpenRouter menyebut model dan alasan dari OpenRouter, tanpa data lain", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "Bad Request",
          url: "https://openrouter.ai/api/v1/chat/completions",
          requestBodyValues: {},
          statusCode: 400,
          responseBody: JSON.stringify({
            error: {
              message:
                "v/r is an embedding model and cannot be used with chat/completions.",
              code: 400,
            },
            user_id: "user_rahasia",
          }),
          isRetryable: false,
        });
      },
    });
    const ai = clientFor(realLlm, model);
    const error = await ai
      .generateStructured({
        task: "roadmap",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: "a", n: 1 }),
      })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "UPSTREAM_AI" });
    const message = (error as AppError).message;
    expect(message).toContain('"v/r"');
    expect(message).toContain("embedding model");
    expect(message).toContain("MODEL_*");
    expect(message).not.toContain("user_rahasia");
  });

  it("galat yang dibungkus RetryError dipetakan dari galat terakhir; kuota harian gratis disebut jelas", async () => {
    const quota = new APICallError({
      message:
        "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    });
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new RetryError({
          message: "Failed after 3 attempts.",
          reason: "maxRetriesExceeded",
          errors: [quota, quota, quota],
        });
      },
    });
    const ai = clientFor(realLlm, model);
    const error = await ai
      .generateStructured({
        task: "spec",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: "a", n: 1 }),
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).toContain(
      "Kuota harian model gratis OpenRouter habis",
    );
    expect((error as AppError).message).toContain("v/s");
    const { blocksFurtherCalls } = await import("@/server/ai/errors");
    expect(blocksFurtherCalls(error)).toBe(true);
    expect(blocksFurtherCalls(new Error("lain"))).toBe(false);
  });

  it("galat 404 tanpa isi respons tetap menyebut model", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "Not Found",
          url: "https://openrouter.ai/api/v1/chat/completions",
          requestBodyValues: {},
          statusCode: 404,
          isRetryable: false,
        });
      },
    });
    const ai = clientFor(realLlm, model);
    const error = await ai
      .generateStructured({
        task: "questions",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: "a", n: 1 }),
      })
      .catch((e: unknown) => e);
    expect((error as AppError).message).toContain('"v/q"');
    expect((error as AppError).message).toMatch(/tidak ditemukan|tidak bisa dipakai/);
  });

  it("tidak menyembunyikan pembatalan sebagai UPSTREAM_AI", async () => {
    const abort = new DOMException("dibatalkan", "AbortError");
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw abort;
      },
    });
    const ai = clientFor(realLlm, model);
    await expect(
      ai.generateStructured({
        task: "questions",
        userId,
        prompt: "p",
        schema: Answer,
        mock: () => ({ title: "a", n: 1 }),
      }),
    ).rejects.toBe(abort);
  });

  it("tetap mengembalikan hasil bila pencatatan pemakaian gagal", async () => {
    const ai = createAiClient({
      llm: realLlm,
      logger,
      recordUsage: () => {
        throw new Error("disk penuh");
      },
      modelFactory: () => generating(JSON.stringify({ title: "a", n: 1 })),
    });
    const result = await ai.generateStructured({
      task: "roadmap",
      userId,
      prompt: "p",
      schema: Answer,
      mock: () => ({ title: "a", n: 1 }),
    });
    expect(result.data).toEqual({ title: "a", n: 1 });
  });

  it("mengalirkan teks dan mencatat pemakaian saat selesai", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Halo, " },
            { type: "text-delta", id: "t", delta: "dunia!" },
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              logprobs: undefined,
              usage: finishUsage,
              providerMetadata: { openrouter: { usage: { cost: 0.5 } } },
            },
          ],
        }),
      }),
    });
    const ai = clientFor(realLlm, model);
    const { textStream, completed } = ai.streamText({
      task: "prd",
      userId,
      prompt: "p",
      mock: "tidak dipakai",
    });
    let text = "";
    for await (const chunk of textStream) text += chunk;

    expect(text).toBe("Halo, dunia!");
    expect((await completed).usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      costUsd: 0.5,
    });
    expect(usageRows()).toMatchObject([{ kind: "prd", model: "v/p", costUsd: 0.5 }]);
  });

  it("melempar UPSTREAM_AI bila stream gagal di tengah jalan dan completed ditolak", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "setengah" },
            { type: "error", error: new Error("koneksi putus") },
          ],
        }),
      }),
    });
    const ai = clientFor(realLlm, model);
    const { textStream, completed } = ai.streamText({
      task: "prd",
      userId,
      prompt: "p",
      mock: "x",
    });
    const read = (async () => {
      for await (const _ of textStream) {
        // dihabiskan
      }
    })();
    await expect(read).rejects.toMatchObject({ code: "UPSTREAM_AI" });
    await expect(completed).rejects.toMatchObject({ code: "UPSTREAM_AI" });
    expect(usageRows()).toHaveLength(0);
  });
});

const List = z.object({ items: z.array(z.object({ name: z.string() })) });
type ListT = z.infer<typeof List>;

function streamingJson(json: string, cost?: number) {
  const pieces = json.match(/.{1,7}/gs) ?? [];
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          ...pieces.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            logprobs: undefined,
            usage: finishUsage,
            providerMetadata:
              cost === undefined ? undefined : { openrouter: { usage: { cost } } },
          },
        ],
      }),
    }),
  });
}

describe("streamStructured", () => {
  it("mode mock: mengirim potongan parsial lalu objek lengkap, dan mencatat pemakaian", async () => {
    const ai = clientFor(mockLlm);
    const seen: unknown[] = [];
    const result = await ai.streamStructured<ListT>({
      task: "roadmap",
      userId,
      prompt: "p",
      schema: List,
      mock: () => ({ items: [{ name: "a" }, { name: "b" }] }),
      mockPartials: (data) => [{ items: data.items.slice(0, 1) }],
      onPartial: (partial) => {
        seen.push(partial);
      },
    });
    expect(seen).toEqual([
      { items: [{ name: "a" }] },
      { items: [{ name: "a" }, { name: "b" }] },
    ]);
    expect(result.data.items).toHaveLength(2);
    expect(usageRows()).toMatchObject([{ kind: "roadmap", costUsd: 0 }]);
  });

  it("mode mock: berhenti saat dibatalkan tanpa mencatat pemakaian", async () => {
    const ai = clientFor(mockLlm);
    const abort = new AbortController();
    const run = ai.streamStructured<ListT>({
      task: "roadmap",
      userId,
      prompt: "p",
      schema: List,
      mock: () => ({ items: [{ name: "a" }] }),
      mockPartials: () => [{ items: [] }, { items: [] }],
      mockDelayMs: 50,
      abortSignal: abort.signal,
    });
    abort.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(usageRows()).toHaveLength(0);
  });

  it("model nyata: objek parsial bertambah dan hasil akhir tervalidasi dengan biaya", async () => {
    const json = JSON.stringify({ items: [{ name: "satu" }, { name: "dua" }] });
    const ai = clientFor(realLlm, streamingJson(json, 0.25));
    const counts: number[] = [];
    const result = await ai.streamStructured<ListT>({
      task: "roadmap",
      userId,
      prompt: "p",
      schema: List,
      mock: () => ({ items: [] }),
      onPartial: (partial) => {
        counts.push(partial.items?.length ?? 0);
      },
    });
    expect(result.data).toEqual({ items: [{ name: "satu" }, { name: "dua" }] });
    expect(counts.length).toBeGreaterThan(1);
    expect(counts.at(-1)).toBe(2);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(usageRows()).toMatchObject([{ kind: "roadmap", model: "v/r", costUsd: 0.25 }]);
  });

  it("model nyata: keluaran yang melanggar skema menjadi UPSTREAM_AI", async () => {
    const ai = clientFor(realLlm, streamingJson(JSON.stringify({ items: "salah" })));
    await expect(
      ai.streamStructured<ListT>({
        task: "roadmap",
        userId,
        prompt: "p",
        schema: List,
        mock: () => ({ items: [] }),
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_AI" });
    expect(usageRows()).toHaveLength(0);
  });

  it("model nyata: galat di tengah aliran menjadi UPSTREAM_AI", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: '{"items":[' },
            { type: "error", error: new Error("koneksi putus") },
          ],
        }),
      }),
    });
    const ai = clientFor(realLlm, model);
    await expect(
      ai.streamStructured<ListT>({
        task: "roadmap",
        userId,
        prompt: "p",
        schema: List,
        mock: () => ({ items: [] }),
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_AI" });
  });

  it("galat dari onPartial diteruskan apa adanya, bukan disangka galat AI", async () => {
    const json = JSON.stringify({ items: [{ name: "satu" }] });
    const ai = clientFor(realLlm, streamingJson(json));
    const boom = new Error("database penuh");
    await expect(
      ai.streamStructured<ListT>({
        task: "roadmap",
        userId,
        prompt: "p",
        schema: List,
        mock: () => ({ items: [] }),
        onPartial: () => {
          throw boom;
        },
      }),
    ).rejects.toBe(boom);
  });
});

async function seedPlanFor(owner: string): Promise<string> {
  const { plans, workspaces } = await import("@/server/db/schema");
  const ws = handle.db
    .insert(workspaces)
    .values({ userId: owner, name: "W" })
    .returning()
    .get();
  return handle.db
    .insert(plans)
    .values({ userId: owner, workspaceId: ws.id, idea: "i" })
    .returning()
    .get().id;
}

describe("streamChat", () => {
  const echoInput = z.object({ note: z.string() });

  function tools(calls: string[]) {
    return {
      catat: defineChatTool({
        description: "Mencatat",
        inputSchema: echoInput,
        execute: async ({ note }) => {
          calls.push(note);
          return { ok: true, saved: note };
        },
      }),
    };
  }

  async function drain(events: AsyncIterable<ChatEvent>) {
    const out: ChatEvent[] = [];
    for await (const event of events) out.push(event);
    return out;
  }

  it("mode mock: teks per kata, tool dijalankan dengan masukan tervalidasi, biaya nol tercatat", async () => {
    const calls: string[] = [];
    const ai = clientFor(mockLlm);
    const { events, completed } = ai.streamChat({
      task: "chat",
      userId,
      messages: [{ role: "user", content: "halo" }],
      tools: tools(calls),
      mock: () => [{ text: "Siap dicatat." }, { tool: "catat", input: { note: "A" } }],
    });
    const out = await drain(events);
    expect(
      out.filter((e) => e.type === "text").map((e) => e.type === "text" && e.text),
    ).toEqual(["Siap ", "dicatat."]);
    expect(out.at(-1)).toEqual({
      type: "tool",
      name: "catat",
      input: { note: "A" },
      output: { ok: true, saved: "A" },
    });
    expect(calls).toEqual(["A"]);
    const result = await completed;
    expect(result.text).toBe("Siap dicatat.");
    expect(usageRows()[0]).toMatchObject({
      kind: "chat",
      model: "mock/chat",
      costUsd: 0,
    });
  });

  it("model sungguhan: panggilan tool dari aliran dijalankan dan hasilnya dikirim sebagai event", async () => {
    const calls: string[] = [];
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Baik." },
            { type: "text-end", id: "t" },
            {
              type: "tool-call",
              toolCallId: "c1",
              toolName: "catat",
              input: JSON.stringify({ note: "B" }),
            },
            {
              type: "finish",
              finishReason: { unified: "tool-calls", raw: undefined },
              logprobs: undefined,
              usage: finishUsage,
              providerMetadata: { openrouter: { usage: { cost: 0.25 } } },
            },
          ],
        }),
      }),
    });
    const ai = clientFor(realLlm, model);
    const { events, completed } = ai.streamChat({
      task: "chat",
      userId,
      messages: [{ role: "user", content: "catat B" }],
      tools: tools(calls),
      mock: () => [],
    });
    const out = await drain(events);
    expect(out).toEqual([
      { type: "text", text: "Baik." },
      {
        type: "tool",
        name: "catat",
        input: { note: "B" },
        output: { ok: true, saved: "B" },
      },
    ]);
    expect(calls).toEqual(["B"]);
    expect(model.doStreamCalls).toHaveLength(1); // satu langkah: tidak ada balasan lanjutan
    await expect(completed).resolves.toMatchObject({ text: "Baik.", model: "v/c" });
    expect(usageRows()[0]).toMatchObject({ kind: "chat", costUsd: 0.25 });
  });

  it("galat model menjadi UPSTREAM_AI di iterator dan di completed", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({
          message: "rate limited",
          url: "https://x",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: false,
        });
      },
    });
    const ai = clientFor(realLlm, model);
    const { events, completed } = ai.streamChat({
      task: "chat",
      userId,
      messages: [{ role: "user", content: "x" }],
      tools: tools([]),
      mock: () => [],
    });
    await expect(drain(events)).rejects.toMatchObject({ code: "UPSTREAM_AI" });
    await expect(completed).rejects.toMatchObject({ code: "UPSTREAM_AI" });
  });
});
