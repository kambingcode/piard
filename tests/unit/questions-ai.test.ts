import { describe, expect, it } from "vitest";
import { mockQuestions } from "@/features/questions/ai/questions.mock";
import { buildQuestionsPrompt } from "@/features/questions/ai/questions.prompt";
import {
  type QuestionsOutput,
  questionsOutputSchema,
} from "@/features/questions/ai/questions.schema";

function at(output: QuestionsOutput, index: number) {
  const question = output.questions[index];
  if (!question) throw new Error(`pertanyaan ${index} tidak ada`);
  return question;
}

const base = {
  idea: "Aplikasi booking klinik",
  language: "id" as const,
  techStack: {},
  extras: [],
};

describe("buildQuestionsPrompt", () => {
  it("memuat ide dan menuntut tepat 5 pertanyaan dengan id yang diamati", () => {
    const { system, prompt } = buildQuestionsPrompt(base);
    expect(prompt).toContain("Aplikasi booking klinik");
    expect(system).toContain("tepat 5 pertanyaan");
    for (const id of [
      "real_user_pain",
      "first_win",
      "must_have_features",
      "main_advantage",
      "come_back_reason",
    ]) {
      expect(system).toContain(id);
    }
  });

  it("membatasi opsi menjadi frasa pendek dan alasan kembali bukan nama fitur (M1-08)", () => {
    const { system } = buildQuestionsPrompt(base);
    expect(system).toContain("frasa 2-5 kata");
    expect(system).toMatch(/come_back_reason.*bukan sekadar nama fitur/);
    expect(system).toContain("tersirat");
  });

  it("memakai bahasa sesuai plan", () => {
    expect(buildQuestionsPrompt(base).system).toContain("Bahasa Indonesia");
    expect(buildQuestionsPrompt({ ...base, language: "en" }).system).toContain("English");
  });

  it("menyebut teknologi dan extras hanya bila dipilih pengguna", () => {
    const none = buildQuestionsPrompt({
      ...base,
      techStack: { backend: "ai-pilih", database: "ai-pilih" },
    });
    expect(none.prompt).not.toMatch(/teknologi pengguna|Fitur tambahan/);

    const chosen = buildQuestionsPrompt({
      ...base,
      techStack: { backend: "Laravel", database: "ai-pilih", frontend: "Vue" },
      extras: ["Auth", "Pembayaran"],
    });
    expect(chosen.prompt).toContain("backend: Laravel");
    expect(chosen.prompt).toContain("frontend: Vue");
    expect(chosen.prompt).not.toContain("database:");
    expect(chosen.prompt).toContain("Auth, Pembayaran");
  });

  it("melarang opsi Lainnya/Lewati dan pertanyaan soal teknologi", () => {
    const { system } = buildQuestionsPrompt(base);
    expect(system).toContain('"Lainnya"');
    expect(system).toContain("Jangan menanyakan teknologi");
  });

  it("deterministik", () => {
    expect(buildQuestionsPrompt(base)).toEqual(buildQuestionsPrompt(base));
  });
});

describe("questionsOutputSchema", () => {
  const valid = mockQuestions("id");
  const clone = () => structuredClone(valid);

  it("menerima fixture mock untuk kedua bahasa", () => {
    expect(questionsOutputSchema.safeParse(mockQuestions("id")).success).toBe(true);
    expect(questionsOutputSchema.safeParse(mockQuestions("en")).success).toBe(true);
  });

  it("fixture mengikuti pola yang diamati: 1 teks, 1 multi, 3 pilihan tunggal", () => {
    const types = valid.questions.map((q) => q.type);
    expect(types).toEqual([
      "text",
      "single_choice",
      "multi_choice",
      "single_choice",
      "single_choice",
    ]);
  });

  it("menolak jumlah pertanyaan selain 5", () => {
    const four = clone();
    four.questions.pop();
    expect(questionsOutputSchema.safeParse(four).success).toBe(false);
    const six = clone();
    six.questions.push({ ...at(six, 0), id: "tambahan" });
    expect(questionsOutputSchema.safeParse(six).success).toBe(false);
  });

  it("menolak id ganda dan id bukan snake_case", () => {
    const dup = clone();
    at(dup, 1).id = at(dup, 0).id;
    expect(questionsOutputSchema.safeParse(dup).success).toBe(false);
    const bad = clone();
    at(bad, 0).id = "Real User";
    expect(questionsOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("menolak teks dengan opsi, pilihan dengan opsi terlalu sedikit/banyak, dan opsi ganda", () => {
    const textWithOptions = clone();
    at(textWithOptions, 0).options = ["a", "b", "c"];
    expect(questionsOutputSchema.safeParse(textWithOptions).success).toBe(false);

    const few = clone();
    at(few, 1).options = ["a", "b"];
    expect(questionsOutputSchema.safeParse(few).success).toBe(false);

    const many = clone();
    at(many, 1).options = ["a", "b", "c", "d", "e", "f", "g"];
    expect(questionsOutputSchema.safeParse(many).success).toBe(false);

    const dupOptions = clone();
    at(dupOptions, 1).options = ["a", "a", "b"];
    expect(questionsOutputSchema.safeParse(dupOptions).success).toBe(false);
  });
});
