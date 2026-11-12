// Evaluasi PRD dengan model nyata: kasus klinik booking dari situs acuan (ide, jawaban klarifikasi,
// dan roadmap 7 fitur di analysis/api-samples/). Dijalankan: `pnpm eval:prd` (model dari MODEL_PRD)
// atau `pnpm eval:prd --models a,b`; `--save <folder>` menyimpan PRD tiap model untuk dibaca.
// Tidak menulis ke database dan tidak mencetak kunci API. Keluar dengan kode 1 bila ada cek gagal.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planSchema } from "@/features/plans";
import { mockPrd } from "@/features/prd/ai/prd.mock";
import { buildPrdPrompt, type PrdPromptInput } from "@/features/prd/ai/prd.prompt";
import { cleanPrd, foundSections } from "@/features/prd/structure";
import { createAiClient } from "@/server/ai/client";
import { providerModelFactory } from "@/server/ai/providers";
import { EnvError, getEnv } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { createLogger } from "@/server/logger";
import { checkPrd } from "./prd-checks";

const SAMPLES = join(__dirname, "..", "..", "analysis", "api-samples");

type SampleFeature = {
  id: string;
  parentId: string | null;
  name: string;
  summary: string;
  phase: number | null;
};

function clinicCase(): PrdPromptInput {
  const raw = JSON.parse(
    readFileSync(join(SAMPLES, "plan-get-after-roadmap.json"), "utf8"),
  ) as { plan: Record<string, unknown> };
  const plan = planSchema
    .pick({
      idea: true,
      language: true,
      techStack: true,
      extras: true,
      questionAnswers: true,
    })
    .parse(raw.plan);
  const roadmap = JSON.parse(
    readFileSync(join(SAMPLES, "roadmap-generate-ready.json"), "utf8"),
  ) as { title: string; features: SampleFeature[]; subFeatures: SampleFeature[] };
  return {
    ...plan,
    title: roadmap.title,
    features: roadmap.features.map((f) => ({
      name: f.name,
      summary: f.summary,
      phase: f.phase,
      subFeatures: roadmap.subFeatures
        .filter((s) => s.parentId === f.id)
        .map((s) => ({ name: s.name, summary: s.summary })),
    })),
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
  const models = argValue("--models")?.split(",").filter(Boolean) ?? [llm.models.prd];
  const saveDir = argValue("--save");
  const input = clinicCase();
  const { system, prompt } = buildPrdPrompt(input);
  let failures = 0;

  for (const model of models) {
    console.log(`\n=== ${model}`);
    const ai = createAiClient({
      llm: { ...llm, models: { ...llm.models, prd: model } },
      recordUsage: () => undefined,
      logger: createLogger({ level: "silent", sink: () => undefined }),
      modelFactory: providerModelFactory(llm.apiKeys),
    });
    const started = performance.now();
    let firstTextMs: number | undefined;
    let text = "";
    let sections = 0;
    try {
      const stream = ai.streamText({
        task: "prd",
        userId: "eval",
        system,
        prompt,
        mock: mockPrd(input),
      });
      for await (const chunk of stream.textStream) {
        firstTextMs ??= performance.now() - started;
        text += chunk;
        const found = foundSections(text).length;
        if (found !== sections) {
          sections = found;
          console.log(
            `  bagian ${found}/7 pada ${((performance.now() - started) / 1000).toFixed(1)} dtk`,
          );
        }
      }
      const { usage } = await stream.completed;
      const elapsed = performance.now() - started;
      const content = cleanPrd(text);
      console.log(
        `selesai ${(elapsed / 1000).toFixed(1)} dtk (teks pertama ${firstTextMs === undefined ? "-" : `${(firstTextMs / 1000).toFixed(1)} dtk`}), ${usage.inputTokens}+${usage.outputTokens} token, US$${usage.costUsd.toFixed(5)}`,
      );
      if (saveDir) {
        mkdirSync(saveDir, { recursive: true });
        const file = join(saveDir, `${model.replace(/[^a-z0-9.-]+/gi, "_")}.md`);
        writeFileSync(file, content);
        console.log(`disimpan: ${file}`);
      }
      for (const check of await checkPrd(
        content,
        input.features.map((f) => f.name),
        elapsed,
      )) {
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
