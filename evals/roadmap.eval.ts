// Evaluasi roadmap dengan OpenRouter nyata: kasus klinik booking dari situs acuan
// (analysis/api-samples/plan-get-after-roadmap.json: ide, 5 pertanyaan, dan jawabannya).
// Dijalankan: `pnpm eval:roadmap` (model dari MODEL_ROADMAP) atau `pnpm eval:roadmap --models a,b`.
// `--codebase`: kasus berkonteks M7-19 (fitur baru untuk Piard sendiri dengan dokumentasi di
// evals/fixtures/piard-docs); dicek juga bahwa roadmap tidak mengulang fitur yang sudah ada.
// Tidak menulis ke database dan tidak mencetak kunci API. Keluar dengan kode 1 bila ada cek gagal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatCodebaseContext } from "@/features/codebase/context";
import { planSchema } from "@/features/plans";
import { mockRoadmap } from "@/features/roadmap/ai/roadmap.mock";
import { completedFeatures } from "@/features/roadmap/ai/roadmap.normalize";
import {
  buildRoadmapPrompt,
  type RoadmapPromptInput,
} from "@/features/roadmap/ai/roadmap.prompt";
import {
  type RoadmapOutput,
  roadmapOutputSchema,
} from "@/features/roadmap/ai/roadmap.schema";
import { createAiClient } from "@/server/ai/client";
import { providerModelFactory } from "@/server/ai/providers";
import { EnvError, getEnv } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { createLogger } from "@/server/logger";
import { checkNoExistingFeatures, checkRoadmap } from "./roadmap-checks";

const SAMPLE = join(
  __dirname,
  "..",
  "..",
  "analysis",
  "api-samples",
  "plan-get-after-roadmap.json",
);

function clinicCase() {
  const raw = JSON.parse(readFileSync(SAMPLE, "utf8")) as {
    plan: Record<string, unknown>;
  };
  // Bentuk contoh situs acuan; field yang tidak dipakai prompt diisi seadanya.
  return planSchema
    .pick({
      idea: true,
      language: true,
      techStack: true,
      extras: true,
      questionAnswers: true,
    })
    .parse(raw.plan);
}

/** Fitur Piard yang sudah ada (judul bagian halaman modul): roadmap fitur baru tidak boleh mengulangnya. */
const EXISTING_FEATURES = [
  "Roadmap",
  "PRD",
  "Spesifikasi",
  "Task",
  "Kanban",
  "Chat Revisi",
  "Pemakaian",
  "Pengaturan",
  "Proyek Eksisting",
  "Ekspor",
];

/** Kasus M7-19: fitur baru untuk Piard dengan konteks dokumentasinya (format sama dengan produksi). */
function codebaseCase(): RoadmapPromptInput {
  const dir = join(__dirname, "fixtures", "piard-docs");
  const titles: Record<string, string> = {
    ringkasan: "Ringkasan",
    teknologi: "Teknologi",
    modul: "Modul",
    data: "Model data",
  };
  const pages = Object.entries(titles).map(([slug, title]) => ({
    slug,
    title,
    content: readFileSync(join(dir, `${slug}.md`), "utf8"),
  }));
  return {
    idea: "Bagikan plan lewat tautan publik baca-saja: pemilik bisa membuat tautan, mengatur kedaluwarsa, dan mencabutnya; orang lain bisa membaca PRD dan roadmap tanpa akun.",
    language: "id",
    techStack: {
      frontend: "React / Next.js",
      backend: "Next.js (route handler)",
      database: "SQLite",
      deployment: "ai-pilih",
    },
    extras: [],
    questionAnswers: { questions: [], answers: {} },
    codebaseContext: formatCodebaseContext("Piard", pages),
  };
}

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
  const models = argValue("--models")?.split(",").filter(Boolean) ?? [llm.models.roadmap];
  const withCodebase = process.argv.includes("--codebase");
  const plan = withCodebase ? codebaseCase() : clinicCase();
  const { system, prompt } = buildRoadmapPrompt(plan);
  let failures = 0;

  for (const model of models) {
    console.log(`\n=== ${model}`);
    const ai = createAiClient({
      llm: { ...llm, models: { ...llm.models, roadmap: model } },
      recordUsage: () => undefined,
      logger: createLogger({ level: "silent", sink: () => undefined }),
      modelFactory: providerModelFactory(llm.apiKeys),
    });
    const started = performance.now();
    let firstNodeMs: number | undefined;
    try {
      const { data, usage } = await ai.streamStructured<RoadmapOutput>({
        task: "roadmap",
        userId: "eval",
        system,
        prompt,
        schema: roadmapOutputSchema,
        mock: () => mockRoadmap(plan.language, "Eval"),
        onPartial: (partial) => {
          if (firstNodeMs === undefined && completedFeatures(partial).length > 0) {
            firstNodeMs = performance.now() - started;
          }
        },
      });
      const elapsed = performance.now() - started;
      console.log(
        `selesai ${(elapsed / 1000).toFixed(1)} dtk (fitur pertama ${firstNodeMs === undefined ? "-" : `${(firstNodeMs / 1000).toFixed(1)} dtk`}), ${usage.inputTokens}+${usage.outputTokens} token, US$${usage.costUsd.toFixed(5)}`,
      );
      console.log(`title: ${data.title}`);
      for (const f of data.features) {
        console.log(`  [F${f.phase}] ${f.name} (${f.icon}): ${f.summary}`);
        console.log(`        ${f.subFeatures.map((s) => s.name).join(" | ")}`);
      }
      const checks = checkRoadmap(data, elapsed);
      if (withCodebase) checks.push(checkNoExistingFeatures(data, EXISTING_FEATURES));
      for (const check of checks) {
        if (!check.pass) failures += 1;
        console.log(`${check.pass ? "✓" : "✗"} ${check.name}: ${check.detail}`);
      }
    } catch (error) {
      failures += 1;
      console.error(`✗ ${error instanceof AppError ? error.message : String(error)}`);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main();
