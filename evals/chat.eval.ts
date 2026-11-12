// Evaluasi chat revisi dengan model nyata: apakah model memanggil tool yang tepat (updatePrd,
// proposeFeatureChanges) dan menjawab pertanyaan tanpa tool. PRD dan fitur memakai PRD mock agar
// tidak butuh panggilan PRD. Dijalankan: `pnpm eval:chat` (model dari MODEL_CHAT) atau
// `pnpm eval:chat --models a,b`. Tool hanya mencatat panggilan; tidak menulis ke database.
import { z } from "zod";
import { mockPrd } from "@/features/prd/ai/prd.mock";
import { normalizeChanges, rawChangeSchema } from "@/features/revision/ai/changes.schema";
import {
  buildChatSystem,
  TOOL_PROPOSE_CHANGES,
  TOOL_UPDATE_PRD,
} from "@/features/revision/ai/chat.prompt";
import { createAiClient, defineChatTool } from "@/server/ai/client";
import { providerModelFactory } from "@/server/ai/providers";
import { EnvError, getEnv } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { createLogger } from "@/server/logger";

const FEATURES = [
  {
    id: "f-cari",
    name: "Pencarian Dokter",
    summary: "Pasien mencari dokter per spesialis dan lokasi.",
    phase: 1,
  },
  {
    id: "f-booking",
    name: "Booking Janji Temu",
    summary: "Pasien memilih jadwal dan memesan.",
    phase: 1,
  },
  {
    id: "f-bayar",
    name: "Pembayaran QRIS",
    summary: "Pasien membayar booking lewat QRIS.",
    phase: 2,
  },
  {
    id: "f-dasbor",
    name: "Dasbor Dokter",
    summary: "Dokter melihat jadwal dan daftar pasien.",
    phase: 2,
  },
];

const CASES: { name: string; text: string; expect: string[] }[] = [
  { name: "pertanyaan", text: "Apa risiko terbesar dari rencana ini?", expect: [] },
  {
    name: "edit PRD",
    text: "Tambahkan kebutuhan non-fungsional: data medis dienkripsi saat disimpan.",
    expect: [TOOL_UPDATE_PRD],
  },
  {
    name: "tambah fitur",
    text: "Tambahkan fitur rekam medis sederhana yang bisa dilihat pasien dan dokter.",
    expect: [TOOL_UPDATE_PRD, TOOL_PROPOSE_CHANGES],
  },
];

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  if (env.llm.mode !== "openrouter") {
    console.error("Eval butuh LLM_MODE=openrouter di .env.");
    process.exit(1);
  }
  const llm = env.llm;
  const models = argValue("--models")?.split(",").filter(Boolean) ?? [llm.models.chat];
  const prd = mockPrd({
    idea: "Aplikasi booking klinik untuk pasien dan dokter",
    language: "id",
    title: "Booking Klinik",
    techStack: {},
    extras: [],
    questionAnswers: { questions: [], answers: {} },
    features: FEATURES.map((f) => ({ ...f, subFeatures: [] })),
  });
  const system = buildChatSystem({
    language: "id",
    title: "Booking Klinik",
    prd,
    prdVersion: 1,
    features: FEATURES.map((f) => ({ ...f, subFeatures: [] })),
  });
  let failures = 0;

  for (const model of models) {
    console.log(`\n=== ${model}`);
    const ai = createAiClient({
      llm: { ...llm, models: { ...llm.models, chat: model } },
      recordUsage: () => undefined,
      logger: createLogger({ level: "silent", sink: () => undefined }),
      modelFactory: providerModelFactory(llm.apiKeys),
    });
    for (const scenario of CASES) {
      const called: string[] = [];
      const notes: string[] = [];
      const tools = {
        [TOOL_UPDATE_PRD]: defineChatTool({
          description: "Merevisi PRD sesuai permintaan pengguna.",
          inputSchema: z.object({ instructions: z.string().min(1), summary: z.string() }),
          execute: async (input) => {
            called.push(TOOL_UPDATE_PRD);
            notes.push(`summary: ${input.summary}`);
            return { ok: true, status: "started" };
          },
        }),
        [TOOL_PROPOSE_CHANGES]: defineChatTool({
          description: "Mengusulkan perubahan daftar fitur roadmap (add/update/remove).",
          inputSchema: z.object({ changes: z.array(rawChangeSchema).min(1) }),
          execute: async ({ changes }) => {
            called.push(TOOL_PROPOSE_CHANGES);
            const valid = normalizeChanges(changes, FEATURES);
            notes.push(
              `perubahan sah ${valid.length}/${changes.length}: ${valid.map((c) => c.op).join(",")}`,
            );
            return { ok: true, proposalId: "eval" };
          },
        }),
      };
      const started = performance.now();
      let text = "";
      try {
        const stream = ai.streamChat({
          task: "chat",
          userId: "eval",
          system,
          messages: [{ role: "user", content: scenario.text }],
          tools,
          mock: () => [],
        });
        for await (const event of stream.events)
          if (event.type === "text") text += event.text;
        const { usage } = await stream.completed;
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        const pass =
          scenario.expect.every((t) => called.includes(t)) &&
          (scenario.expect.length > 0 || called.length === 0);
        if (!pass) failures += 1;
        console.log(
          `${pass ? "✓" : "✗"} ${scenario.name}: tool [${called.join(", ") || "-"}] (diharapkan [${scenario.expect.join(", ") || "-"}]), ${seconds} dtk, ${usage.inputTokens}+${usage.outputTokens} token, US$${usage.costUsd.toFixed(5)}`,
        );
        for (const note of notes) console.log(`    ${note}`);
        console.log(
          `    teks: ${text.replace(/\s+/g, " ").trim().slice(0, 160) || "(kosong)"}`,
        );
      } catch (error) {
        failures += 1;
        console.error(
          `✗ ${scenario.name}: ${error instanceof AppError ? error.message : String(error)}`,
        );
      }
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main();
