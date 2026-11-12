// Evaluasi analisis proyek eksisting (M7-11) dengan model nyata pada repo lokal (bawaan: folder `app`
// ini sendiri). Jalur sama dengan produksi: ZIP di memori → pemindai + sensor → job `codebase-analyze`
// dengan job runner sungguhan di database sementara di memori. Dijalankan: `pnpm eval:codebase`
// (`MODEL_CODEBASE`), `--dir <folder>`, `--model <id>`, `--save <folder>` (tulis halaman .md),
// `--estimate-only` (tanpa memanggil model). Tidak mencetak kunci API. Keluar 1 bila ada cek gagal.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { skipReasonForPath } from "@/features/codebase/scan/rules";
import { DOC_SLUGS, type DocSlug } from "@/features/codebase/schemas";
import { ANALYZE_JOB, createAnalysisService } from "@/features/codebase/server/analyze";
import { createCodebaseRepo } from "@/features/codebase/server/repo";
import { createCodebaseService } from "@/features/codebase/server/service";
import { createSourceStore } from "@/features/codebase/server/source-store";
import {
  type AiClient,
  createAiClient,
  type GenerateStructuredArgs,
} from "@/server/ai/client";
import { providerModelFactory } from "@/server/ai/providers";
import { databaseUsageRecorder } from "@/server/ai/usage";
import { EnvError, getEnv } from "@/server/config/env";
import { createDb, runMigrations } from "@/server/db/client";
import { usage, users } from "@/server/db/schema";
import { createJobRepo, createJobRunner } from "@/server/jobs";
import { createLogger } from "@/server/logger";
import { checkCodebaseDocs } from "./codebase-checks";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Berkas repo dari disk; folder yang pasti dilewati pemindai tidak dimasuki sama sekali. */
function readRepo(root: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split("\\").join("/");
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (skipReasonForPath(`${rel}/x`) === null) walk(full);
      } else if (stat.isFile() && skipReasonForPath(rel) === null) {
        files[`repo/${rel}`] = readFileSync(full);
      }
    }
  };
  walk(root);
  return files;
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
  const estimateOnly = process.argv.includes("--estimate-only");
  if (env.llm.mode !== "openrouter" && !estimateOnly) {
    console.error("Eval butuh LLM_MODE=openrouter di .env (atau pakai --estimate-only).");
    process.exit(1);
  }
  const model = argValue("--model") ?? env.llm.models.codebase;
  const dir = resolve(argValue("--dir") ?? ".");

  const { db, close } = createDb(":memory:");
  runMigrations(db);
  const user = db
    .insert(users)
    .values({ email: "eval@piard.local", passwordHash: "x", name: "Eval" })
    .returning()
    .get();
  const repo = createCodebaseRepo(db);
  const store = createSourceStore(join(tmpdir(), `piard-eval-${process.pid}`));
  const codebases = createCodebaseService(repo, {
    store,
    maxUploadBytes: 50 * 1024 * 1024,
  });
  const logger = createLogger({ level: "silent", sink: () => undefined });
  const llm =
    env.llm.mode === "openrouter"
      ? { ...env.llm, models: { ...env.llm.models, codebase: model } }
      : env.llm;
  const baseAi = createAiClient({
    llm,
    recordUsage: databaseUsageRecorder(db),
    logger,
    modelFactory:
      llm.mode === "openrouter" ? providerModelFactory(llm.apiKeys) : undefined,
  });
  // Per panggilan: jenis langkah, karakter yang dikirim, dan token nyata (untuk kalibrasi perkiraan).
  const calls: { kind: string; chars: number; input: number; output: number }[] = [];
  const ai: AiClient = {
    ...baseAi,
    async generateStructured<T>(args: GenerateStructuredArgs<T>) {
      const prompt = "prompt" in args ? (args.prompt ?? "") : "";
      const kind = /Potongan \d+ dari/.test(prompt)
        ? "ringkasan"
        : /Berkas kunci:/.test(prompt)
          ? "profil"
          : "halaman";
      const result = await baseAi.generateStructured(args);
      calls.push({
        kind,
        chars: (args.system ?? "").length + prompt.length,
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      });
      return result;
    },
  };
  const runner = createJobRunner({ repo: createJobRepo(db), logger });
  const analysis = createAnalysisService({
    repo,
    store,
    ai,
    jobs: runner,
    model: () => model,
    budget: () => ({
      daily: { spentUsd: 0, limitUsd: null },
      monthly: { spentUsd: 0, limitUsd: null },
    }),
    own: codebases.own,
  });
  runner.register(ANALYZE_JOB, analysis.run);

  const { id } = codebases.create(user.id, {
    name: argValue("--name") ?? "Piard",
    source: "zip",
    language: "id",
  });
  const zip = zipSync(readRepo(dir));
  const received = codebases.receiveZip(user.id, id, zip, "eval.zip");
  const estimate = analysis.estimate(user.id, id);
  console.log(`\n=== ${dir} | model ${model}`);
  console.log(
    `ZIP ${(zip.length / 1024).toFixed(0)} KB, ${received.manifest?.totalFiles} berkas teks, ` +
      `${received.manifest?.redactions} nilai disensor; ${estimate.chunks} potongan, ` +
      `${estimate.calls} panggilan, perkiraan ${estimate.inputTokens} token masuk / ` +
      `${estimate.outputTokens} keluar, ` +
      `US$${estimate.costUsd === null ? "?" : estimate.costUsd.toFixed(4)}`,
  );
  if (estimateOnly) {
    close();
    return;
  }

  const started = performance.now();
  const stop = runner.subscribe(
    (event) =>
      process.stdout.write(
        `\r${event.progress.phase} ${event.progress.done}/${event.progress.total}   `,
      ),
    { kind: ANALYZE_JOB },
  );
  analysis.start(user.id, id, { confirmed: true });
  await runner.idle();
  stop();
  const seconds = (performance.now() - started) / 1000;
  const status = analysis.status(user.id, id);
  console.log(
    `\nstatus ${status.status}${status.error ? `: ${status.error}` : ""}, ${seconds.toFixed(0)} dtk`,
  );

  const rows = db.select().from(usage).where(eq(usage.kind, "codebase")).all();
  const actualIn = rows.reduce((s, r) => s + r.inputTokens, 0);
  const actualOut = rows.reduce((s, r) => s + r.outputTokens, 0);
  const cost = rows.reduce((s, r) => s + r.costUsd, 0);
  console.log(
    `aktual: ${rows.length} panggilan, ${actualIn} token masuk / ${actualOut} keluar, US$${cost.toFixed(4)}`,
  );

  const perKind = new Map<
    string,
    { n: number; chars: number; input: number; output: number }
  >();
  for (const call of calls) {
    const sum = perKind.get(call.kind) ?? { n: 0, chars: 0, input: 0, output: 0 };
    perKind.set(call.kind, {
      n: sum.n + 1,
      chars: sum.chars + call.chars,
      input: sum.input + call.input,
      output: sum.output + call.output,
    });
  }
  for (const [kind, sum] of perKind) {
    console.log(
      `  ${kind}: ${sum.n}× masuk ${sum.input} (${(sum.chars / Math.max(1, sum.input)).toFixed(2)} karakter/token), ` +
        `keluar ${sum.output} (rata-rata ${Math.round(sum.output / sum.n)})`,
    );
  }

  const pages: Partial<Record<DocSlug, string>> = {};
  for (const summary of codebases.listDocs(user.id, id)) {
    pages[summary.slug] = codebases.getDoc(user.id, id, summary.slug).page.content;
  }
  const saveDir = argValue("--save");
  if (saveDir) {
    mkdirSync(saveDir, { recursive: true });
    for (const slug of DOC_SLUGS) {
      if (pages[slug]) writeFileSync(join(saveDir, `${slug}.md`), pages[slug] ?? "");
    }
    console.log(`halaman disimpan di ${saveDir}`);
  }

  const manifestPaths = repo.find(user.id, id)?.manifest?.files.map((f) => f.path) ?? [];
  let failures = status.status === "ready" ? 0 : 1;
  for (const check of await checkCodebaseDocs({
    pages,
    manifestPaths,
    exists: (path) =>
      existsSync(resolve(dir, path)) || existsSync(resolve(dir, "..", path)),
    estimateInput: estimate.inputTokens,
    actualInput: actualIn,
  })) {
    if (!check.pass) failures += 1;
    console.log(`${check.pass ? "✓" : "✗"} ${check.name}: ${check.detail}`);
  }
  store.remove(id);
  close();
  if (failures > 0) process.exitCode = 1;
}

main();
