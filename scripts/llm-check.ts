// Memeriksa konfigurasi LLM dan mencoba satu panggilan kecil ke tiap model yang dipakai.
// Dijalankan: `pnpm llm:check` (tambahkan `--questions` untuk uji tugas pertanyaan sungguhan dengan 3 ide,
// dan `--models a,b` untuk membandingkan model pertanyaan lain). Tidak pernah mencetak kunci API; tidak menulis ke database.
import { z } from "zod";
import { mockQuestions } from "@/features/questions/ai/questions.mock";
import type { QuestionsPromptInput } from "@/features/questions/ai/questions.prompt";
import { buildQuestionsPrompt } from "@/features/questions/ai/questions.prompt";
import { questionsOutputSchema } from "@/features/questions/ai/questions.schema";
import { createAiClient } from "@/server/ai/client";
import { providerModelFactory } from "@/server/ai/providers";
import {
  AI_TASKS,
  type AiTask,
  EnvError,
  getEnv,
  type LlmConfig,
} from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { createLogger } from "@/server/logger";

/** Tiga ide yang berbeda domain, panjang, dan bahasa (kartu M1-08). */
const IDEAS: { name: string; input: QuestionsPromptInput }[] = [
  {
    name: "klinik booking (id, sedang)",
    input: {
      idea: "Aplikasi booking klinik untuk pasien dan dokter. Pasien mencari dokter berdasarkan spesialis dan lokasi, melihat jadwal praktik, booking janji temu, membayar lewat QRIS, dan mendapat pengingat lewat WhatsApp. Dokter punya dasbor jadwal dan daftar pasien.",
      language: "id",
      techStack: {},
      extras: [],
    },
  },
  {
    name: "habit tracker (en, pendek)",
    input: {
      idea: "A habit tracker for remote teams that nudges people on Slack.",
      language: "en",
      techStack: {},
      extras: [],
    },
  },
  {
    name: "katering UMKM (id, panjang + stack)",
    input: {
      idea: "Saya punya usaha katering rumahan di Bandung dengan 3 karyawan. Pesanan sekarang masuk lewat WhatsApp dan dicatat di buku, sering ada yang terlewat atau salah jumlah porsi. Saya ingin aplikasi untuk mencatat pesanan harian dan langganan mingguan kantor, menghitung kebutuhan bahan belanja dari menu, mengatur jadwal antar kurir, dan mengirim tagihan. Pelanggan kantor ingin bisa melihat menu minggu depan dan mengubah jumlah porsi sendiri sebelum H-1 jam 15.00.",
      language: "id",
      techStack: { frontend: "Next.js", database: "PostgreSQL" },
      extras: ["Notifikasi WhatsApp"],
    },
  },
];

const PingSchema = z.object({ ok: z.boolean(), kata: z.string() });

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof EnvError) fail(error.message);
    throw error;
  }

  const { llm } = env;
  console.log(`LLM_MODE        : ${llm.mode}`);
  if (llm.mode === "mock") {
    console.log(
      "Mode mock: tidak ada panggilan nyata. Ubah LLM_MODE=openrouter di .env untuk menguji.",
    );
    return;
  }
  console.log(
    `OPENROUTER_API_KEY: ${llm.apiKeys.openrouter ? "terisi" : "tidak dipakai"}`,
  );
  console.log(
    `ANTHROPIC_API_KEY : ${llm.apiKeys.anthropic ? "terisi" : "tidak dipakai"}`,
  );
  for (const task of AI_TASKS)
    console.log(`MODEL_${task.toUpperCase().padEnd(9)}: ${llm.models[task]}`);

  // Satu panggilan per model unik (bukan per tugas) agar murah.
  const byModel = new Map<string, AiTask>();
  for (const task of AI_TASKS)
    if (!byModel.has(llm.models[task])) byModel.set(llm.models[task], task);

  const ai = createAiClient({
    llm,
    recordUsage: () => undefined,
    logger: createLogger({ level: "silent", sink: () => undefined }),
    modelFactory: providerModelFactory(llm.apiKeys),
  });

  let failures = 0;
  for (const [model, task] of byModel) {
    const started = performance.now();
    try {
      const { data, usage } = await ai.generateStructured({
        task,
        userId: "llm-check",
        prompt: 'Balas dengan ok=true dan kata="halo".',
        schema: PingSchema,
        mock: () => ({ ok: true, kata: "halo" }),
      });
      const ms = Math.round(performance.now() - started);
      console.log(
        `✓ ${model}: ${ms} ms, ${usage.inputTokens}+${usage.outputTokens} token, US$${usage.costUsd.toFixed(6)}, jawaban=${JSON.stringify(data)}`,
      );
    } catch (error) {
      failures += 1;
      console.error(
        `✗ ${model}: ${error instanceof AppError ? error.message : "galat tak terduga"}`,
      );
    }
  }
  if (process.argv.includes("--questions")) {
    const models = argValue("--models")?.split(",").filter(Boolean) ?? [
      llm.models.questions,
    ];
    for (const model of models) failures += await checkQuestions(llm, model);
  }
  if (failures > 0) process.exitCode = 1;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Tugas pertanyaan klarifikasi yang sebenarnya: prompt dan skema yang dipakai aplikasi. */
async function checkQuestions(
  llm: Extract<LlmConfig, { mode: "openrouter" }>,
  model: string,
): Promise<number> {
  const ai = createAiClient({
    llm: { ...llm, models: { ...llm.models, questions: model } },
    recordUsage: () => undefined,
    logger: createLogger({ level: "silent", sink: () => undefined }),
    modelFactory: providerModelFactory(llm.apiKeys),
  });
  console.log(`\n=== Uji pertanyaan klarifikasi dengan ${model}`);
  let failures = 0;
  let totalMs = 0;
  let totalUsd = 0;
  for (const { name, input } of IDEAS) {
    console.log(`\n-- ${name}`);
    const started = performance.now();
    try {
      const { system, prompt } = buildQuestionsPrompt(input);
      const { data, usage } = await ai.generateStructured({
        task: "questions",
        userId: "llm-check",
        system,
        prompt,
        schema: questionsOutputSchema,
        mock: () => mockQuestions(input.language),
      });
      const ms = Math.round(performance.now() - started);
      totalMs += ms;
      totalUsd += usage.costUsd;
      console.log(
        `✓ skema valid: ${ms} ms, ${usage.inputTokens}+${usage.outputTokens} token, US$${usage.costUsd.toFixed(6)}`,
      );
      for (const q of data.questions) {
        console.log(
          `  - [${q.type}] ${q.question}${q.options.length ? `\n      ${q.options.join(" | ")}` : ""}`,
        );
      }
    } catch (error) {
      failures += 1;
      console.error(
        `✗ ${error instanceof AppError ? error.message : "galat tak terduga"}`,
      );
    }
  }
  console.log(
    `\n== ${model}: ${IDEAS.length - failures}/${IDEAS.length} lolos, rata-rata ${Math.round(totalMs / IDEAS.length)} ms, total US$${totalUsd.toFixed(6)}`,
  );
  return failures;
}

main();
