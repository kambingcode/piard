// Evaluasi spesifikasi & task dengan model nyata: kasus klinik booking dari situs acuan (ide, jawaban,
// roadmap 7 fitur). Dijalankan: `pnpm eval:build` (MODEL_SPEC dan MODEL_TASKS, 2 fitur pertama),
// `--models a,b` (model yang sama untuk keduanya), `--features n`, `--prd <berkas.md>` (bawaan: PRD
// tiruan dari roadmap). Tidak menulis ke database dan tidak mencetak kunci API. Keluar 1 bila ada cek gagal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chosenTech, planSchema } from "@/features/plans";
import { mockPrd } from "@/features/prd/ai/prd.mock";
import { mockSpec, mockTasks } from "@/features/specs/ai/build.mock";
import {
  type BuildPromptInput,
  buildSpecPrompt,
  buildTasksPrompt,
} from "@/features/specs/ai/build.prompt";
import { specOutputSchema, tasksOutputSchema } from "@/features/specs/ai/build.schema";
import { renderSpec } from "@/features/specs/spec-markdown";
import { renderTaskPrompt } from "@/features/specs/task-prompt";
import { createAiClient } from "@/server/ai/client";
import { providerModelFactory } from "@/server/ai/providers";
import { EnvError, getEnv } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { createLogger } from "@/server/logger";
import { checkBuild } from "./build-checks";

const SAMPLES = join(__dirname, "..", "..", "analysis", "api-samples");

type SampleFeature = {
  id: string;
  parentId: string | null;
  name: string;
  summary: string;
  phase: number | null;
};

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function clinicCase() {
  const raw = JSON.parse(
    readFileSync(join(SAMPLES, "plan-get-after-roadmap.json"), "utf8"),
  ) as {
    plan: Record<string, unknown>;
  };
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
  ) as {
    title: string;
    features: SampleFeature[];
    subFeatures: SampleFeature[];
  };
  const features = roadmap.features.map((f) => ({
    name: f.name,
    summary: f.summary,
    phase: f.phase,
    subFeatures: roadmap.subFeatures
      .filter((s) => s.parentId === f.id)
      .map((s) => ({ name: s.name, summary: s.summary })),
  }));
  const prdFile = argValue("--prd");
  const prd = prdFile
    ? readFileSync(prdFile, "utf8")
    : mockPrd({ ...plan, title: roadmap.title, features });
  return { plan, title: roadmap.title, features, prd };
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
  const models = argValue("--models")?.split(",").filter(Boolean);
  const runs = models
    ? models.map((m) => ({ spec: m, tasks: m }))
    : [{ spec: llm.models.spec, tasks: llm.models.tasks }];
  const count = Number(argValue("--features") ?? 2);
  const { plan, title, features, prd } = clinicCase();
  let failures = 0;

  for (const run of runs) {
    console.log(`\n=== spec: ${run.spec} | tasks: ${run.tasks}`);
    const ai = createAiClient({
      llm: { ...llm, models: { ...llm.models, spec: run.spec, tasks: run.tasks } },
      recordUsage: () => undefined,
      logger: createLogger({ level: "silent", sink: () => undefined }),
      modelFactory: providerModelFactory(llm.apiKeys),
    });
    for (const feature of features.slice(0, count)) {
      const input: BuildPromptInput = {
        ...plan,
        title,
        prd,
        allFeatures: features.map((f) => f.name),
        feature,
      };
      try {
        let started = performance.now();
        const spec = await ai.generateStructured({
          task: "spec",
          userId: "eval",
          ...buildSpecPrompt(input),
          schema: specOutputSchema,
          mock: () => mockSpec(plan.language, feature),
        });
        const specMs = performance.now() - started;
        const featureSpec = renderSpec(plan.language, spec.data.feature);
        started = performance.now();
        const tasks = await ai.generateStructured({
          task: "tasks",
          userId: "eval",
          ...buildTasksPrompt({
            ...input,
            spec: featureSpec,
            subSpecs: spec.data.subFeatures.map((s) => ({
              name: s.name,
              spec: renderSpec(plan.language, s),
            })),
          }),
          schema: tasksOutputSchema,
          mock: () => mockTasks(plan.language, feature),
        });
        const tasksMs = performance.now() - started;
        console.log(
          `\n-- ${feature.name}: spesifikasi ${(specMs / 1000).toFixed(1)} dtk (US$${spec.usage.costUsd.toFixed(5)}), task ${(tasksMs / 1000).toFixed(1)} dtk (US$${tasks.usage.costUsd.toFixed(5)})`,
        );
        console.log(featureSpec.trim().replace(/^/gm, "   "));
        for (const [i, t] of tasks.data.tasks.entries()) {
          console.log(`   ${i + 1}. ${t.title} — ${t.description}`);
        }
        const prompts = tasks.data.tasks.map((task) =>
          renderTaskPrompt(
            {
              language: plan.language,
              product: title,
              feature: feature.name,
              phase: feature.phase,
              tech: chosenTech(plan.techStack),
              spec: featureSpec,
            },
            task,
          ),
        );
        console.log(`   prompt task 1:\n${prompts[0]?.replace(/^/gm, "      ")}`);
        for (const check of checkBuild(
          { name: feature.name, subFeatures: feature.subFeatures.map((s) => s.name) },
          spec.data,
          tasks.data,
          prompts,
        )) {
          if (!check.pass) failures += 1;
          console.log(`${check.pass ? "✓" : "✗"} ${check.name}: ${check.detail}`);
        }
      } catch (error) {
        failures += 1;
        console.error(
          `✗ ${feature.name}: ${error instanceof AppError ? error.message : String(error)}`,
        );
      }
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main();
