import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES } from "@/features/codebase/limits";
import { estimateTokens, packFiles } from "@/features/codebase/scan/pack";
import { normalizeEntryPath, wrapperFolder } from "@/features/codebase/scan/paths";
import { REDACTED, redactSecrets } from "@/features/codebase/scan/redact";
import { keyKindOf, languageOf, skipReasonForPath } from "@/features/codebase/scan/rules";
import {
  type RawEntry,
  type SourceFile,
  scanRepo,
} from "@/features/codebase/scan/scan-repo";
import { detectStack } from "@/features/codebase/scan/stack";

const enc = new TextEncoder();
const entry = (path: string, text: string): RawEntry => ({
  path,
  bytes: enc.encode(text),
});

/**
 * Rahasia palsu dirakit dari potongan agar berkas tes ini sendiri tidak berisi string berbentuk token
 * (pemindai rahasia GitHub dan sejenisnya akan menandainya).
 */
const fake = {
  github: `ghp${"_"}${"A1b2C3d4E5".repeat(4)}`,
  aws: `AK${"IA"}${"ABCDEFGHIJ012345"}`,
  stripe: `sk${"_live_"}${"abcdefghijklmnop1234"}`,
  openai: `sk${"-proj-"}${"abcdefghijklmnopqrstuvwx"}`,
  anthropic: `sk${"-ant-"}api03-${"abcdefghijklmnopqrstu"}`,
  slack: `xo${"xb"}-1234567890-abcdefghij`,
  google: `AI${"za"}${"Sy".padEnd(35, "x")}`,
  jwt: `ey${"J"}hbGciOiJIUzI1NiJ9.ey${"J"}zdWIiOiIxMjM0In0.abcdefghijklmnop`,
  piard: `pc${"b_"}${"abcdefghijklmnopqrstuvwx"}`,
  piardPlan: `pp${"l_"}${"abcdefghijklmnopqrstuvwx"}`,
  pem: [
    `-----BEGIN ${"RSA PRIVATE"} KEY-----`,
    "MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun",
    `-----END ${"RSA PRIVATE"} KEY-----`,
  ].join("\n"),
};

describe("normalizeEntryPath", () => {
  it("menormalkan jalur relatif dan direktori", () => {
    expect(normalizeEntryPath("src/app.ts")).toEqual({
      kind: "file",
      path: "src/app.ts",
    });
    expect(normalizeEntryPath("./src//a\\b.ts")).toEqual({
      kind: "file",
      path: "src/a/b.ts",
    });
    expect(normalizeEntryPath("src/")).toEqual({ kind: "dir" });
    expect(normalizeEntryPath("./")).toEqual({ kind: "dir" });
  });

  it("menandai zip-slip, jalur absolut, huruf drive, NUL, dan jalur ekstrem", () => {
    for (const bad of [
      "../etc/passwd",
      "a/../../b",
      "a\\..\\..\\b",
      "/etc/passwd",
      "C:/Windows/x",
      "c:\\x",
      "a\0b",
      `${"a/".repeat(40)}x`,
      "x".repeat(600),
    ]) {
      expect(normalizeEntryPath(bad).kind, bad).toBe("unsafe");
    }
  });
});

describe("wrapperFolder", () => {
  it("mengenali folder pembungkus tunggal ala arsip GitHub", () => {
    expect(wrapperFolder(["repo-main/a.ts", "repo-main/src/b.ts"])).toBe("repo-main");
    expect(wrapperFolder(["a.ts", "src/b.ts"])).toBeNull();
    expect(wrapperFolder(["x/a.ts", "y/b.ts"])).toBeNull();
    expect(wrapperFolder([])).toBeNull();
  });
});

describe("aturan berkas", () => {
  it("melewati dependensi, build, lockfile, biner, hasil generate, dan kunci privat", () => {
    expect(skipReasonForPath("node_modules/react/index.js")).toBe("ignored_dir");
    expect(skipReasonForPath("apps/web/.next/server.js")).toBe("ignored_dir");
    expect(skipReasonForPath(".git/config")).toBe("ignored_dir");
    expect(skipReasonForPath("__MACOSX/._a.ts")).toBe("ignored_dir");
    expect(skipReasonForPath("src/.DS_Store")).toBe("ignored_dir");
    expect(skipReasonForPath("pnpm-lock.yaml")).toBe("lockfile");
    expect(skipReasonForPath("web/go.sum")).toBe("lockfile");
    expect(skipReasonForPath("public/app.min.js")).toBe("generated");
    expect(skipReasonForPath("public/logo.png")).toBe("binary");
    expect(skipReasonForPath("data/app.sqlite")).toBe("binary");
    expect(skipReasonForPath("certs/server.pem")).toBe("private_key");
    expect(skipReasonForPath(".ssh/id_rsa")).toBe("private_key");
    expect(skipReasonForPath("src/app.ts")).toBeNull();
    // Nama yang mirip folder abaikan tetapi berupa berkas tetap dibaca.
    expect(skipReasonForPath("src/build.ts")).toBeNull();
  });

  it("menebak bahasa dan berkas kunci", () => {
    expect(languageOf("src/a.tsx")).toBe("TypeScript");
    expect(languageOf("Dockerfile")).toBe("Docker");
    expect(languageOf("LICENSE")).toBeNull();
    expect(keyKindOf("README.md")).toBe("readme");
    expect(keyKindOf("package.json")).toBe("manifest");
    expect(keyKindOf("apps/api/go.mod")).toBe("manifest");
    expect(keyKindOf("next.config.ts")).toBe("config");
    expect(keyKindOf(".env.example")).toBe("config");
    expect(keyKindOf("prisma/schema.prisma")).toBe("schema");
    expect(keyKindOf("src/db/schema.ts")).toBe("schema");
    expect(keyKindOf("src/app/api/users/route.ts")).toBe("route");
    expect(keyKindOf("src/main.ts")).toBe("entry");
    expect(keyKindOf("cmd/api/main.go")).toBe("entry");
    expect(keyKindOf("src/features/auth/index.ts")).toBeNull();
    expect(keyKindOf("docs/setup.md")).toBe("docs");
    expect(keyKindOf("src/components/button.tsx")).toBeNull();
  });
});

describe("redactSecrets", () => {
  it("menghapus semua pola token yang dikenal", () => {
    const text = Object.values(fake).join("\n");
    const result = redactSecrets("src/config.ts", text);
    for (const [name, secret] of Object.entries(fake)) {
      expect(result.text, name).not.toContain(secret);
    }
    expect(result.count).toBeGreaterThanOrEqual(Object.keys(fake).length);
  });

  it("menyensor nilai env tetapi mempertahankan nama variabel", () => {
    const env = [
      "# komentar tetap",
      "DATABASE_URL=postgres://admin:sandi-rahasia@db.local:5432/app",
      'export API_KEY="nilai-rahasia"',
      "EMPTY=",
      "PORT=3000",
    ].join("\n");
    const { text, count } = redactSecrets(".env.local", env);
    expect(text).toContain("# komentar tetap");
    expect(text).toContain(`DATABASE_URL=${REDACTED}`);
    expect(text).toContain(`export API_KEY=${REDACTED}`);
    expect(text).toContain("EMPTY=");
    expect(text).toContain(`PORT=${REDACTED}`);
    expect(text).not.toContain("sandi-rahasia");
    expect(text).not.toContain("nilai-rahasia");
    expect(count).toBe(3);
  });

  it("menyensor kredensial di URL dan nilai literal bernama rahasia", () => {
    const code = [
      'const url = "mongodb://user:p4ssw0rd@cluster.example.com/db";',
      "const config = { apiKey: \"abc123def456\", password: 'hunter22' };",
      'DB_PASSWORD = "super-secret"',
      '"client_secret": "zzzzzzzz"',
      "//registry.npmjs.org/:_authToken=abcdef123456",
    ].join("\n");
    const { text } = redactSecrets("src/db.ts", code);
    for (const leaked of [
      "p4ssw0rd",
      "abc123def456",
      "hunter22",
      "super-secret",
      "zzzzzzzz",
      "abcdef123456",
    ]) {
      expect(text, leaked).not.toContain(leaked);
    }
    expect(text).toContain("mongodb://[DISEMBUNYIKAN]@cluster.example.com/db");
    expect(text).toContain('apiKey: "[DISEMBUNYIKAN]"');
  });

  it("tidak mengubah kode biasa dan tidak menghitung ganda", () => {
    const code = [
      "if (password === input) return true;",
      "const tokenLabel = 'Token akses';",
      "const schema = z.object({ password: z.string().min(8) });",
      'fetch("https://api.example.com/v1/items")',
    ].join("\n");
    expect(redactSecrets("src/a.ts", code)).toEqual({ text: code, count: 0 });

    const once = redactSecrets("src/a.ts", `const key = "${fake.openai}";`);
    expect(once.count).toBe(1);
    expect(redactSecrets("src/a.ts", once.text).count).toBe(0);
  });
});

describe("detectStack", () => {
  const file = (path: string, text: string) => ({ path, text, size: text.length });

  it("mendeteksi proyek Next.js + Drizzle + SQLite + Docker", () => {
    const stack = detectStack([
      file(
        "package.json",
        JSON.stringify({
          dependencies: {
            next: "16",
            react: "19",
            "drizzle-orm": "1",
            "better-sqlite3": "13",
          },
          devDependencies: { typescript: "5", vitest: "5", tailwindcss: "4" },
        }),
      ),
      file("src/app/api/plan/route.ts", "export const GET = () => {}".repeat(10)),
      file("tsconfig.json", "{}"),
      file("Dockerfile", "FROM node"),
      file(".github/workflows/ci.yml", "on: push"),
    ]);
    expect(stack).toEqual({
      languages: ["TypeScript", "Docker"],
      frontend: "Next.js",
      backend: "Next.js (route handler)",
      database: "SQLite",
      deployment: "Docker",
      tools: ["Drizzle ORM", "GitHub Actions", "Tailwind CSS", "TypeScript", "Vitest"],
    });
  });

  it("mendeteksi ekosistem non-JS dari manifes dan compose", () => {
    const python = detectStack([
      file("requirements.txt", "fastapi==0.110\npsycopg2-binary\nuvicorn"),
      file("app/main.py", "app = FastAPI()"),
      file("fly.toml", "app = 'x'"),
      file("Dockerfile", "FROM python"),
    ]);
    expect(python).toMatchObject({
      languages: ["Python", "Docker"],
      backend: "FastAPI",
      database: "PostgreSQL",
      deployment: "Fly.io",
    });

    const go = detectStack([
      file("go.mod", "module x\nrequire github.com/gin-gonic/gin v1.9.0"),
      file(
        "docker-compose.yml",
        "services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7",
      ),
    ]);
    expect(go).toMatchObject({ backend: "Gin", database: "PostgreSQL" });
    expect(go.tools).toEqual(["Docker Compose", "Redis"]);
  });

  it("membaca provider Prisma, bukan generator", () => {
    const stack = detectStack([
      file(
        "prisma/schema.prisma",
        'generator client {\n  provider = "prisma-client-js"\n}\ndatasource db {\n  provider = "postgresql"\n}',
      ),
    ]);
    expect(stack.database).toBe("PostgreSQL");
    expect(stack.tools).toContain("Prisma");
  });

  it("package.json rusak dan repo kosong tidak membuat galat", () => {
    expect(detectStack([file("package.json", "{bukan json")])).toEqual({
      languages: ["JSON"],
      tools: [],
    });
    expect(detectStack([])).toEqual({ languages: [], tools: [] });
  });
});

describe("scanRepo", () => {
  it("melepas pembungkus, menyaring, dan mengisi manifes", () => {
    const result = scanRepo([
      entry("toko-main/README.md", "# Toko"),
      entry("toko-main/package.json", JSON.stringify({ dependencies: { express: "4" } })),
      entry("toko-main/src/server.ts", "import express from 'express';"),
      entry("toko-main/node_modules/express/index.js", "module.exports = {}"),
      entry("toko-main/pnpm-lock.yaml", "lockfileVersion: 9"),
      { path: "toko-main/public/logo.bin", bytes: new Uint8Array([0, 1, 2, 3]) },
      { path: "toko-main/data.txt", bytes: new Uint8Array([0xff, 0xfe, 0xfd]) },
      { path: "toko-main/big.ts", bytes: new Uint8Array(MAX_FILE_BYTES + 1).fill(97) },
    ]);
    expect(result.files.map((f) => f.path)).toEqual([
      "README.md",
      "package.json",
      "src/server.ts",
    ]);
    expect(result.manifest).toMatchObject({
      totalFiles: 3,
      skipped: { ignored_dir: 1, lockfile: 1, binary: 2, too_large: 1 },
      redactions: 0,
      redactedFiles: 0,
    });
    expect(result.manifest.files.find((f) => f.path === "README.md")?.key).toBe("readme");
    expect(result.detectedStack.backend).toBe("Express");
  });

  it("rahasia di fixture tidak pernah lolos ke keluaran", () => {
    const result = scanRepo([
      entry("src/config.ts", `export const keys = ${JSON.stringify(fake)};`),
      entry(".env", `OPENAI_API_KEY=${fake.openai}\nGITHUB_TOKEN=${fake.github}`),
      entry("deploy/key.pem", fake.pem),
      entry("README.md", `Token contoh: ${fake.piard}`),
    ]);
    const everything = JSON.stringify(result);
    for (const [name, secret] of Object.entries(fake)) {
      expect(everything, name).not.toContain(secret);
    }
    expect(result.files.map((f) => f.path)).toEqual([
      ".env",
      "README.md",
      "src/config.ts",
    ]);
    expect(result.manifest.skipped.private_key).toBe(1);
    expect(result.manifest.redactedFiles).toBe(3);
    expect(result.manifest.redactions).toBeGreaterThanOrEqual(Object.keys(fake).length);
  });

  it("menggabungkan hitungan yang sudah dilewati pemanggil dan membuang BOM", () => {
    const result = scanRepo(
      [entry("package.json", '\uFEFF{"dependencies":{"hono":"4"}}')],
      {
        ignored_dir: 120,
        binary: 3,
      },
    );
    expect(result.manifest.skipped).toEqual({ ignored_dir: 120, binary: 3 });
    expect(result.files[0]?.text.startsWith("{")).toBe(true);
    expect(result.detectedStack.backend).toBe("Hono");
  });

  it("deterministik terhadap urutan masukan", () => {
    const entries = [entry("b.ts", "b"), entry("a.ts", "aa"), entry("src/c.ts", "c")];
    const forward = scanRepo(entries);
    const backward = scanRepo([...entries].reverse());
    expect(forward).toEqual(backward);
    expect(forward.files.map((f) => f.path)).toEqual(["a.ts", "b.ts", "src/c.ts"]);
  });

  it("jalur ganda memakai entri pertama menurut urutan arsip", () => {
    const result = scanRepo([entry("a.ts", "pertama"), entry("a.ts", "kedua")]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.text).toBe("pertama");
  });

  it("tidak melepas pembungkus yang sendirinya folder abaikan", () => {
    const result = scanRepo([
      entry("node_modules/x/index.js", "x"),
      entry("node_modules/y.js", "y"),
    ]);
    expect(result.files).toEqual([]);
    expect(result.manifest.skipped.ignored_dir).toBe(2);
  });
});

describe("packFiles", () => {
  const source = (
    path: string,
    chars: number,
    key: SourceFile["key"] = null,
  ): SourceFile => ({
    path,
    text: "x".repeat(chars),
    size: chars,
    language: "TypeScript",
    key,
  });

  it("berkas kunci lebih dulu dan setiap potongan dalam anggaran", () => {
    const files = [
      source("src/z.ts", 4_000),
      source("src/a.ts", 4_000),
      source("README.md", 400, "readme"),
      source("package.json", 400, "manifest"),
    ];
    // README + package.json = 200 token; a.ts (1.000 token) tidak muat lagi di potongan 1.000 token.
    const result = packFiles(files, {
      chunkTokens: 1_000,
      fileTokens: 1_000,
      totalTokens: 100_000,
    });
    expect(result.chunks.map((c) => c.files.map((f) => f.path))).toEqual([
      ["README.md", "package.json"],
      ["src/a.ts"],
      ["src/z.ts"],
    ]);
    for (const chunk of result.chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(1_000);
      expect(chunk.tokens).toBe(
        chunk.files.reduce((s, f) => s + estimateTokens(f.text), 0),
      );
    }
    expect(result.dropped).toEqual([]);
  });

  it("memotong berkas besar dan tetap dalam anggaran potongan", () => {
    const big = { ...source("src/big.ts", 0), text: "baris kode\n".repeat(5_000) };
    const result = packFiles([big], { chunkTokens: 1_000, fileTokens: 1_000 });
    const packed = result.chunks[0]?.files[0];
    expect(packed?.truncated).toBe(true);
    expect(packed?.text).toMatch(/… \[dipotong: ±\d+ baris lagi\]$/);
    expect(estimateTokens(packed?.text ?? "")).toBeLessThanOrEqual(1_000);
    expect(result.truncated).toEqual(["src/big.ts"]);
  });

  it("mencatat berkas yang tidak muat anggaran total", () => {
    const files = [source("a.ts", 4_000), source("b.ts", 4_000), source("c.ts", 4_000)];
    const result = packFiles(files, {
      totalTokens: 2_000,
      chunkTokens: 1_500,
      fileTokens: 1_500,
    });
    expect(result.chunks.flatMap((c) => c.files.map((f) => f.path))).toEqual([
      "a.ts",
      "b.ts",
    ]);
    expect(result.dropped).toEqual(["c.ts"]);
    expect(result.tokens).toBeLessThanOrEqual(2_000);
  });

  it("repo kosong menghasilkan nol potongan", () => {
    expect(packFiles([])).toEqual({ chunks: [], truncated: [], dropped: [], tokens: 0 });
  });
});
