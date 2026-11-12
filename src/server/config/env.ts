import "server-only";

import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { AI_TASKS, type AiTask, isAnthropicModel, mapTasks } from "@/lib/ai-models";

export { AI_TASKS, type AiTask, isAnthropicModel };

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Ambang log yang bisa diatur; `silent` membisukan semuanya (dipakai tes). */
export const LOG_THRESHOLDS = [...LOG_LEVELS, "silent"] as const;
export type LogThreshold = (typeof LOG_THRESHOLDS)[number];

const DEFAULT_DATABASE_PATH = "data/piard.db";
const DEFAULT_SESSION_TTL_DAYS = 30;
/** Batas upload ZIP proyek eksisting (ADR 0016). */
const DEFAULT_CODEBASE_MAX_UPLOAD_MB = 50;
const MAX_CODEBASE_UPLOAD_MB = 500;
const IN_MEMORY_DATABASE = ":memory:";

/** `KEY=` kosong di berkas .env dianggap tidak diisi. */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());
const optionalUsd = z.preprocess(
  blankToUndefined,
  z.coerce.number().positive().optional(),
);

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(LOG_THRESHOLDS).default("info"),
  DATABASE_PATH: z.preprocess(
    blankToUndefined,
    z.string().trim().min(1).default(DEFAULT_DATABASE_PATH),
  ),
  SESSION_TTL_DAYS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().default(DEFAULT_SESSION_TTL_DAYS),
  ),
  LLM_MODE: z.enum(["mock", "openrouter"]).default("mock"),
  OPENROUTER_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  MODEL_QUESTIONS: optionalString,
  MODEL_ROADMAP: optionalString,
  MODEL_PRD: optionalString,
  MODEL_SPEC: optionalString,
  MODEL_TASKS: optionalString,
  MODEL_CHAT: optionalString,
  MODEL_CODEBASE: optionalString,
  BUDGET_DAILY_USD: optionalUsd,
  BUDGET_MONTHLY_USD: optionalUsd,
  /** Alamat publik Piard untuk prompt agen (mis. `https://piard.example.com`); kosong = origin permintaan. */
  APP_URL: z.preprocess(
    blankToUndefined,
    z
      .url({ protocol: /^https?$/, message: "APP_URL harus URL http(s) lengkap" })
      .optional(),
  ),
  CODEBASE_MAX_UPLOAD_MB: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_CODEBASE_UPLOAD_MB)
      .default(DEFAULT_CODEBASE_MAX_UPLOAD_MB),
  ),
});

type RawEnv = z.infer<typeof rawEnvSchema>;

/**
 * Kunci per penyedia; `null` bila tidak diisi. Kunci yang diisi tetap dibawa walau model `.env` tidak
 * memakainya, agar model yang diganti di /settings bisa memakai penyedia lain. Nama `apiKeys`
 * disembunyikan logger.
 */
export type LlmKeys = { openrouter: string | null; anthropic: string | null };

export type LlmConfig =
  | { mode: "mock"; models: Record<AiTask, string> }
  | { mode: "openrouter"; apiKeys: LlmKeys; models: Record<AiTask, string> };

/** Konfigurasi aplikasi yang sudah divalidasi. Satu-satunya bentuk yang dilihat kode lain. */
export type Env = {
  nodeEnv: RawEnv["NODE_ENV"];
  logLevel: LogThreshold;
  databasePath: string;
  sessionTtlDays: number;
  llm: LlmConfig;
  budget: BudgetLimits;
  /** Apakah kunci tiap penyedia diisi (juga di mode mock); nilainya hanya ada di `llm.apiKeys`. */
  keysSet: { openrouter: boolean; anthropic: boolean };
  /**
   * Proyek eksisting: batas upload dan folder sumber sementara (teks tersaring, dihapus setelah
   * analisis; ADR 0016). Folder berada di sebelah database agar ikut backup/volume yang sama.
   */
  codebase: { maxUploadBytes: number; sourceDir: string };
  /** Origin publik dari `APP_URL` (tanpa jalur/garis miring akhir), atau null. */
  appUrl: string | null;
};

/** Batas biaya USD; `null` berarti tanpa batas. */
export type BudgetLimits = { dailyUsd: number | null; monthlyUsd: number | null };

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Konfigurasi env tidak valid:\n${problems.map((p) => `  - ${p}`).join("\n")}\nPeriksa .env (lihat .env.example).`,
    );
    this.name = "EnvError";
  }
}

const MODEL_KEYS = {
  questions: "MODEL_QUESTIONS",
  roadmap: "MODEL_ROADMAP",
  prd: "MODEL_PRD",
  spec: "MODEL_SPEC",
  tasks: "MODEL_TASKS",
  chat: "MODEL_CHAT",
  codebase: "MODEL_CODEBASE",
} as const satisfies Record<AiTask, keyof RawEnv>;

/**
 * Tugas yang ditambahkan setelah `.env` pengguna dibuat: boleh kosong agar `.env` lama tetap valid.
 * Bawaannya Haiku lewat penyedia yang kuncinya ada (Anthropic langsung, atau OpenRouter).
 */
const OPTIONAL_TASKS: Partial<Record<AiTask, (raw: RawEnv) => string>> = {
  codebase: (raw) =>
    raw.ANTHROPIC_API_KEY ? "claude-haiku-5-5" : "anthropic/claude-haiku-5.5",
};

function resolveLlm(raw: RawEnv, problems: string[]): LlmConfig {
  const configured = (task: AiTask) =>
    raw[MODEL_KEYS[task]] ??
    (raw.LLM_MODE === "mock" ? undefined : OPTIONAL_TASKS[task]?.(raw));

  if (raw.LLM_MODE === "mock") {
    return {
      mode: "mock",
      models: mapTasks((task) => configured(task) ?? `mock/${task}`),
    };
  }

  for (const task of AI_TASKS) {
    if (!configured(task))
      problems.push(`${MODEL_KEYS[task]} wajib diisi bila LLM_MODE=openrouter`);
  }
  const models = mapTasks((task) => configured(task) ?? "");
  const ids = Object.values(models).filter(Boolean);
  // Kunci hanya diwajibkan untuk penyedia yang benar-benar dipakai salah satu tugas.
  const needsAnthropic = ids.some(isAnthropicModel);
  const needsOpenRouter = ids.length === 0 || ids.some((id) => !isAnthropicModel(id));
  if (needsOpenRouter && !raw.OPENROUTER_API_KEY) {
    problems.push("OPENROUTER_API_KEY wajib diisi bila LLM_MODE=openrouter");
  }
  if (needsAnthropic && !raw.ANTHROPIC_API_KEY) {
    problems.push("ANTHROPIC_API_KEY wajib diisi bila ada MODEL_* berawalan claude-");
  }
  return {
    mode: "openrouter",
    apiKeys: {
      openrouter: raw.OPENROUTER_API_KEY ?? null,
      anthropic: raw.ANTHROPIC_API_KEY ?? null,
    },
    models,
  };
}

/**
 * Memvalidasi dan memetakan variabel lingkungan menjadi {@link Env}.
 *
 * @param source Pasangan kunci-nilai mentah (biasanya `process.env`).
 * @throws {EnvError} Bila ada nilai tidak valid; pesan menyebut semua masalah sekaligus.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = rawEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`),
    );
  }
  const raw = parsed.data;
  const problems: string[] = [];
  const llm = resolveLlm(raw, problems);
  if (problems.length > 0) throw new EnvError(problems);

  return {
    nodeEnv: raw.NODE_ENV,
    logLevel: raw.LOG_LEVEL,
    databasePath: raw.DATABASE_PATH,
    sessionTtlDays: raw.SESSION_TTL_DAYS,
    llm,
    budget: {
      dailyUsd: raw.BUDGET_DAILY_USD ?? null,
      monthlyUsd: raw.BUDGET_MONTHLY_USD ?? null,
    },
    keysSet: {
      openrouter: raw.OPENROUTER_API_KEY !== undefined,
      anthropic: raw.ANTHROPIC_API_KEY !== undefined,
    },
    codebase: {
      maxUploadBytes: raw.CODEBASE_MAX_UPLOAD_MB * 1024 * 1024,
      // Database di memori (tes) tidak punya folder; sumber sementara masuk folder temp sistem.
      sourceDir:
        raw.DATABASE_PATH === IN_MEMORY_DATABASE
          ? join(tmpdir(), "piard-codebase")
          : join(dirname(raw.DATABASE_PATH), "tmp", "codebase"),
    },
    appUrl: raw.APP_URL ? new URL(raw.APP_URL).origin : null,
  };
}

let cached: Env | undefined;

/**
 * Konfigurasi proses saat ini, divalidasi sekali lalu disimpan.
 * Ini satu-satunya tempat `process.env` dibaca.
 *
 * @throws {EnvError} Bila env tidak valid.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Hanya untuk tes: paksa env dibaca ulang. */
export function resetEnvForTests(): void {
  cached = undefined;
}
