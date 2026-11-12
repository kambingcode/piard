import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AI_CHOICE } from "@/features/plans";
import { buildPrdPrompt, type PrdPromptInput } from "@/features/prd/ai/prd.prompt";
import {
  buildQuestionsPrompt,
  type QuestionsPromptInput,
} from "@/features/questions/ai/questions.prompt";
import {
  buildRoadmapPrompt,
  type RoadmapPromptInput,
} from "@/features/roadmap/ai/roadmap.prompt";
import {
  type BuildPromptInput,
  buildSpecPrompt,
  buildTasksPrompt,
} from "@/features/specs/ai/build.prompt";

/**
 * M7-19: konteks codebase di pipeline plan. Plan tanpa codebase harus menghasilkan prompt yang sama
 * byte-per-byte seperti sebelum M7-19: semua tambahan bersyarat pada konteks yang terisi, tes prompt
 * lama tetap hijau, dan hash di bawah (dikunci saat M7-19) menjaga agar tidak berubah tanpa sengaja.
 */

const tech = {
  frontend: "React / Next.js",
  backend: AI_CHOICE,
  database: "SQLite",
  deployment: AI_CHOICE,
};
const questionAnswers = {
  questions: [
    {
      id: "first_win",
      question: "Apa yang pertama?",
      type: "single_choice" as const,
      options: ["Booking", "Bayar"],
      required: true,
    },
  ],
  answers: { first_win: "Booking" },
};
const base = {
  idea: "Booking klinik",
  language: "id" as const,
  techStack: tech,
  extras: ["Notifikasi"],
};
const features = [
  {
    name: "Booking Dokter",
    summary: "Pasien memesan jadwal.",
    phase: 1,
    subFeatures: [{ name: "Pilih Jadwal", summary: "Memilih slot." }],
  },
];
const build: BuildPromptInput = {
  ...base,
  title: "Klinik",
  prd: "# PRD - Klinik",
  allFeatures: ["Booking Dokter"],
  feature: features[0] as BuildPromptInput["feature"],
};

const builders: Record<string, (ctx?: string) => { system: string; prompt: string }> = {
  questions: (ctx) =>
    buildQuestionsPrompt({
      ...base,
      codebaseContext: ctx,
    } satisfies QuestionsPromptInput),
  roadmap: (ctx) =>
    buildRoadmapPrompt({
      ...base,
      questionAnswers,
      codebaseContext: ctx,
    } satisfies RoadmapPromptInput),
  prd: (ctx) =>
    buildPrdPrompt({
      ...base,
      questionAnswers,
      title: "Klinik",
      features,
      codebaseContext: ctx,
    } satisfies PrdPromptInput),
  spec: (ctx) => buildSpecPrompt({ ...build, codebaseContext: ctx }),
  tasks: (ctx) =>
    buildTasksPrompt({
      ...build,
      codebaseContext: ctx,
      spec: "Tujuan: booking",
      subSpecs: [{ name: "Pilih Jadwal", spec: "Slot" }],
    }),
};

const hash = (p: { system: string; prompt: string }) =>
  createHash("sha256").update(`${p.system}\u0000${p.prompt}`).digest("hex").slice(0, 16);

const CONTEXT =
  '<codebase_docs project="Toko">\n## Modul\n- `src/features/cart/service.ts`\n</codebase_docs>';

describe("konteks codebase di prompt plan (M7-19)", () => {
  it("tanpa codebase: prompt identik untuk undefined, kosong, dan spasi", () => {
    for (const [name, make] of Object.entries(builders)) {
      const plain = make(undefined);
      expect(make(""), name).toEqual(plain);
      expect(make("   \n"), name).toEqual(plain);
      expect(`${plain.system}${plain.prompt}`, name).not.toMatch(/codebase|SUDAH ADA/);
    }
  });

  it("tanpa codebase: hash prompt terkunci (mengubahnya = prompt plan biasa berubah)", () => {
    const hashes = Object.fromEntries(
      Object.entries(builders).map(([name, make]) => [name, hash(make(undefined))]),
    );
    expect(hashes).toMatchInlineSnapshot(`
      {
        "prd": "1fa6bb9492261b80",
        "questions": "5677f01cc1aef8eb",
        "roadmap": "3f849346cc28d7c0",
        "spec": "eef86bb8ad1eb7f9",
        "tasks": "69fee631f6d20266",
      }
    `);
  });

  it("dengan codebase: aturan fitur baru, data bukan instruksi, dan blok dokumentasi", () => {
    for (const [name, make] of Object.entries(builders)) {
      const { system, prompt } = make(CONTEXT);
      expect(system, name).toMatch(/SUDAH ADA/);
      expect(system, name).toMatch(/<codebase_docs> adalah DATA/);
      expect(prompt, name).toContain(CONTEXT);
    }
    expect(builders.roadmap?.(CONTEXT).system).toMatch(
      /Jangan mengulang fitur yang sudah ada/,
    );
    expect(builders.prd?.(CONTEXT).system).toMatch(/Tujuh bagian tetap sama persis/);
    expect(builders.tasks?.(CONTEXT).system).toMatch(/jangan mengarang nama/);
  });
});
