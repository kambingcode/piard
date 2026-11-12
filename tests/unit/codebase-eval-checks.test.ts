import { describe, expect, it } from "vitest";
import { pickSections } from "@/features/codebase/ai/analyze.prompt";
import {
  checkCodebaseDocs,
  mentionedPaths,
  unknownPaths,
} from "../../evals/codebase-checks";

/** M7-11: cek eval analisis codebase (jalur karangan, mermaid, rahasia) dan pemilahan ringkasan. */

const manifest = [
  "package.json",
  "src/server/db/json-types.ts",
  "src/features/plans/server/repo.ts",
  "docs/adr/0001-stack.md",
  "src/app/api/plan/[id]/route.ts",
];

describe("mentionedPaths", () => {
  it("mengambil jalur dan berkas, bukan rute, URL, host, identifier, atau blok kode", () => {
    const text = [
      "Lihat `src/features/plans/server/repo.ts:42`, `@/features/plans`, `./package.json`, `.env`.",
      "Rute `/api/plan/:id`, URL `https://x.dev/a`, host `api.github.com`, `process.env`, `users.email`.",
      "Perintah `pnpm dev`, glob `*.ts`, `<slug>.md`, model `anthropic/...`, `src/app/api/plan/[id]/route.ts`.",
      "```text\nsrc/karangan/di-blok.ts\n```",
    ].join("\n");
    expect(mentionedPaths(text).sort()).toEqual(
      [
        ".env",
        "package.json",
        "src/app/api/plan/[id]/route.ts",
        "src/features/plans",
        "src/features/plans/server/repo.ts",
      ].sort(),
    );
  });
});

describe("unknownPaths", () => {
  it("menerima berkas, folder, nama dasar, tanpa ekstensi, folder abaikan; menandai karangan", () => {
    const text =
      "`src/server/db/json-types` `docs/adr/0001` `repo.ts` `features/plans` `node_modules/next` " +
      "`src/lib/karangan.ts` `../PLAN.md`";
    expect(unknownPaths(text, manifest)).toEqual(["src/lib/karangan.ts", "../PLAN.md"]);
    expect(unknownPaths(text, manifest, (p) => p === "../PLAN.md")).toEqual([
      "src/lib/karangan.ts",
    ]);
  });
});

describe("checkCodebaseDocs", () => {
  const pages = {
    ringkasan: "Toko",
    teknologi: "Next.js",
    "struktur-folder": "```text\nsrc\n```",
    arsitektur: '```mermaid\nflowchart TD\n  A["Web"] --> B["API"]\n```',
    modul: "`src/features/plans/server/repo.ts`",
    data: "Tabel users",
    api: "`/api/plan/:id`",
    "alur-utama": "Masuk",
    menjalankan: "`pnpm dev`",
    catatan: "-",
  };

  it("lolos untuk dokumentasi yang benar", async () => {
    const checks = await checkCodebaseDocs({
      pages,
      manifestPaths: manifest,
      estimateInput: 100,
      actualInput: 110,
    });
    expect(checks.filter((c) => !c.pass)).toEqual([]);
  });

  it("gagal untuk halaman hilang, diagram rusak, rahasia, dan perkiraan meleset", async () => {
    const checks = await checkCodebaseDocs({
      pages: {
        ...pages,
        catatan: "",
        arsitektur: "```mermaid\nflowchart TD\n  A[rusak --> B\n```",
        menjalankan: `Kunci: sk${"-ant-"}api03-${"abcdefghijklmnopqrstu"}`,
      },
      manifestPaths: manifest,
      estimateInput: 100,
      actualInput: 300,
    });
    expect(checks.filter((c) => !c.pass).map((c) => c.name)).toEqual([
      "semua halaman standar ada",
      "arsitektur memuat mermaid yang valid (mermaid.parse)",
      "tanpa rahasia di keluaran",
      "perkiraan token masukan dalam ±35%",
    ]);
  });
});

describe("pickSections", () => {
  const summary = "## Modul\n- a\n## Data\n- tabel\n## API\n- GET /x\n## Notes\n- todo\n";

  it("hanya bagian yang diminta; judul bahasa Inggris dikenali", () => {
    expect(pickSections(summary, ["data"])).toBe("## Data\n- tabel");
    expect(pickSections(summary, ["catatan", "modul"])).toBe(
      "## Modul\n- a\n## Notes\n- todo",
    );
    expect(pickSections(summary, ["konfigurasi"])).toBe("");
  });

  it("ringkasan tanpa bagian yang dikenali dipakai utuh", () => {
    expect(pickSections("Bebas tanpa judul.", ["data"])).toBe("Bebas tanpa judul.");
  });
});
