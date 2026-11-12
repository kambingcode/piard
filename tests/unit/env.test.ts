import { describe, expect, it } from "vitest";
import { AI_TASKS, EnvError, parseEnv } from "@/server/config/env";

const openrouterEnv = {
  LLM_MODE: "openrouter",
  OPENROUTER_API_KEY: "sk-test",
  MODEL_QUESTIONS: "v/q",
  MODEL_ROADMAP: "v/r",
  MODEL_PRD: "v/p",
  MODEL_SPEC: "v/s",
  MODEL_TASKS: "v/t",
  MODEL_CHAT: "v/c",
};

describe("parseEnv", () => {
  it("memakai default aman bila env kosong", () => {
    const env = parseEnv({});
    expect(env).toMatchObject({
      nodeEnv: "development",
      logLevel: "info",
      databasePath: "data/piard.db",
      sessionTtlDays: 30,
      budget: { dailyUsd: null, monthlyUsd: null },
    });
    expect(env.llm.mode).toBe("mock");
  });

  it("batas upload proyek eksisting dan folder sumber sementara di sebelah database", () => {
    expect(parseEnv({}).codebase).toEqual({
      maxUploadBytes: 50 * 1024 * 1024,
      sourceDir: "data/tmp/codebase",
    });
    expect(
      parseEnv({ CODEBASE_MAX_UPLOAD_MB: "5", DATABASE_PATH: "/srv/piard/app.db" })
        .codebase,
    ).toEqual({
      maxUploadBytes: 5 * 1024 * 1024,
      sourceDir: "/srv/piard/tmp/codebase",
    });
    expect(parseEnv({ DATABASE_PATH: ":memory:" }).codebase.sourceDir).toMatch(
      /piard-codebase$/,
    );
    expect(() => parseEnv({ CODEBASE_MAX_UPLOAD_MB: "0" })).toThrow(EnvError);
    expect(() => parseEnv({ CODEBASE_MAX_UPLOAD_MB: "9999" })).toThrow(EnvError);
    expect(() => parseEnv({ CODEBASE_MAX_UPLOAD_MB: "abc" })).toThrow(EnvError);
  });

  it("APP_URL opsional, dinormalkan menjadi origin, hanya http(s)", () => {
    expect(parseEnv({}).appUrl).toBeNull();
    expect(parseEnv({ APP_URL: " " }).appUrl).toBeNull();
    expect(parseEnv({ APP_URL: "https://piard.example.com/app/" }).appUrl).toBe(
      "https://piard.example.com",
    );
    expect(parseEnv({ APP_URL: "http://192.168.1.5:3000" }).appUrl).toBe(
      "http://192.168.1.5:3000",
    );
    expect(() => parseEnv({ APP_URL: "piard.example.com" })).toThrow(EnvError);
    expect(() => parseEnv({ APP_URL: "ftp://piard.example.com" })).toThrow(EnvError);
  });

  it("memberi nama model palsu per tugas pada mode mock", () => {
    const { llm } = parseEnv({});
    for (const task of AI_TASKS) expect(llm.models[task]).toBe(`mock/${task}`);
  });

  it("menganggap nilai kosong sebagai tidak diisi", () => {
    const env = parseEnv({
      DATABASE_PATH: "",
      BUDGET_DAILY_USD: "",
      OPENROUTER_API_KEY: "",
    });
    expect(env.databasePath).toBe("data/piard.db");
    expect(env.budget.dailyUsd).toBeNull();
  });

  it("membaca batas biaya sebagai angka", () => {
    const env = parseEnv({ BUDGET_DAILY_USD: "1.5", BUDGET_MONTHLY_USD: "20" });
    expect(env.budget).toEqual({ dailyUsd: 1.5, monthlyUsd: 20 });
  });

  it("menerima konfigurasi openrouter lengkap", () => {
    const env = parseEnv(openrouterEnv);
    expect(env.llm).toEqual({
      mode: "openrouter",
      apiKeys: { openrouter: "sk-test", anthropic: null },
      models: {
        questions: "v/q",
        roadmap: "v/r",
        prd: "v/p",
        spec: "v/s",
        tasks: "v/t",
        chat: "v/c",
        // MODEL_CODEBASE tidak diisi: `.env` lama tetap valid, bawaan Haiku lewat OpenRouter.
        codebase: "anthropic/claude-haiku-5.5",
      },
    });
  });

  it("MODEL_CODEBASE opsional: bawaan mengikuti kunci yang ada, nilai diisi tetap dipakai", () => {
    expect(
      parseEnv({ ...openrouterEnv, ANTHROPIC_API_KEY: "sk-ant" }).llm.models.codebase,
    ).toBe("claude-haiku-5-5");
    expect(
      parseEnv({ ...openrouterEnv, MODEL_CODEBASE: "v/cb" }).llm.models.codebase,
    ).toBe("v/cb");
    expect(parseEnv({}).llm.models.codebase).toBe("mock/codebase");
    const error = catchEnvError(() => parseEnv({ LLM_MODE: "openrouter" }));
    expect(error.message).not.toContain("MODEL_CODEBASE");
  });

  it("menolak openrouter tanpa kunci dan menyebut semua model yang kurang", () => {
    const error = catchEnvError(() => parseEnv({ LLM_MODE: "openrouter" }));
    expect(error.problems).toContain(
      "OPENROUTER_API_KEY wajib diisi bila LLM_MODE=openrouter",
    );
    for (const key of ["QUESTIONS", "ROADMAP", "PRD", "SPEC", "TASKS", "CHAT"]) {
      expect(error.message).toContain(`MODEL_${key} wajib diisi`);
    }
  });

  it("mengarahkan model claude-* ke Anthropic dan hanya mewajibkan kunci yang dipakai", () => {
    const env = parseEnv({
      ...openrouterEnv,
      OPENROUTER_API_KEY: "sk-or",
      ANTHROPIC_API_KEY: "sk-ant",
      MODEL_QUESTIONS: "claude-haiku-5-5",
      MODEL_ROADMAP: "claude-haiku-5-5",
    });
    expect(env.llm).toMatchObject({
      apiKeys: { openrouter: "sk-or", anthropic: "sk-ant" },
      models: { questions: "claude-haiku-5-5", prd: "v/p" },
    });

    const allClaude = Object.fromEntries(
      ["QUESTIONS", "ROADMAP", "PRD", "SPEC", "TASKS", "CHAT"].map((k) => [
        `MODEL_${k}`,
        "claude-haiku-5-5",
      ]),
    );
    const onlyAnthropic = parseEnv({
      LLM_MODE: "openrouter",
      ANTHROPIC_API_KEY: "sk-ant",
      ...allClaude,
    });
    expect(onlyAnthropic.llm).toMatchObject({
      apiKeys: { openrouter: null, anthropic: "sk-ant" },
    });
  });

  it("menolak model claude-* tanpa ANTHROPIC_API_KEY", () => {
    const error = catchEnvError(() =>
      parseEnv({ ...openrouterEnv, MODEL_ROADMAP: "claude-haiku-5-5" }),
    );
    expect(error.problems).toEqual([
      "ANTHROPIC_API_KEY wajib diisi bila ada MODEL_* berawalan claude-",
    ]);
  });

  it("tetap memakai OpenRouter untuk ID anthropic/… gaya OpenRouter", () => {
    const env = parseEnv({
      ...openrouterEnv,
      MODEL_QUESTIONS: "anthropic/claude-haiku-5.5",
    });
    expect(env.llm).toMatchObject({ apiKeys: { anthropic: null } });
  });

  it("menolak nilai yang tidak valid dengan pesan yang menyebut kuncinya", () => {
    const error = catchEnvError(() =>
      parseEnv({ LLM_MODE: "gpt", SESSION_TTL_DAYS: "-3", BUDGET_DAILY_USD: "0" }),
    );
    expect(error.message).toMatch(/LLM_MODE/);
    expect(error.message).toMatch(/SESSION_TTL_DAYS/);
    expect(error.message).toMatch(/BUDGET_DAILY_USD/);
  });

  it("tidak membocorkan nilai kunci di pesan galat", () => {
    const error = catchEnvError(() =>
      parseEnv({ LLM_MODE: "openrouter", OPENROUTER_API_KEY: "sk-rahasia" }),
    );
    expect(error.message).not.toContain("sk-rahasia");
  });
});

function catchEnvError(run: () => unknown): EnvError {
  try {
    run();
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("Diharapkan EnvError, tetapi tidak ada galat");
}

describe("LOG_LEVEL", () => {
  it("menerima silent dan menolak level tak dikenal", () => {
    expect(parseEnv({ LOG_LEVEL: "silent" }).logLevel).toBe("silent");
    expect(() => parseEnv({ LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });
});
