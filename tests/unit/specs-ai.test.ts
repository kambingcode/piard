import { describe, expect, it } from "vitest";
import { mockSpec, mockTasks } from "@/features/specs/ai/build.mock";
import {
  type BuildPromptInput,
  buildSpecPrompt,
  buildTasksPrompt,
  PRD_CONTEXT_CHARS,
} from "@/features/specs/ai/build.prompt";
import { specOutputSchema, tasksOutputSchema } from "@/features/specs/ai/build.schema";
import { renderSpec } from "@/features/specs/spec-markdown";
import { renderTaskPrompt } from "@/features/specs/task-prompt";
import { checkBuild } from "../../evals/build-checks";

const input: BuildPromptInput = {
  idea: "Aplikasi booking klinik",
  language: "id",
  techStack: {
    backend: "Laravel",
    database: "ai-pilih",
    frontend: "ai-pilih",
    deployment: "ai-pilih",
  },
  title: "Booking Klinik",
  prd: "# PRD - Booking Klinik\n\n## 1. Ringkasan\nisi",
  allFeatures: ["Booking Dokter", "Pembayaran"],
  feature: {
    name: "Booking Dokter",
    summary: "Memesan jadwal.",
    phase: 1,
    subFeatures: [
      { name: "Cari Dokter", summary: "Mencari." },
      { name: "Pilih Jam", summary: "Memilih slot." },
    ],
  },
};

describe("prompt spesifikasi & task", () => {
  it("memuat produk, PRD, fitur yang dikerjakan, sub-fitur berurutan, dan fitur lain", () => {
    const { system, prompt } = buildSpecPrompt(input);
    expect(system).toContain("Bahasa Indonesia");
    expect(prompt).toContain("Produk: Booking Klinik");
    expect(prompt).toContain("FITUR YANG DIKERJAKAN SEKARANG: Booking Dokter (Fase 1)");
    expect(prompt).toContain("1. Cari Dokter: Mencari.\n2. Pilih Jam: Memilih slot.");
    expect(prompt).toContain("Semua fitur roadmap: Booking Dokter, Pembayaran.");
    expect(prompt).toContain("backend: Laravel");
    expect(prompt).not.toContain("ai-pilih");
  });

  it("memotong PRD yang terlalu panjang", () => {
    const { prompt } = buildSpecPrompt({
      ...input,
      prd: "x".repeat(PRD_CONTEXT_CHARS + 50),
    });
    expect(prompt).toContain("…(dipotong)");
    expect(prompt.length).toBeLessThan(PRD_CONTEXT_CHARS + 2_000);
  });

  it("prompt task menyertakan spesifikasi fitur dan sub-fitur", () => {
    const { system, prompt } = buildTasksPrompt({
      ...input,
      spec: "### Tujuan\nA\n",
      subSpecs: [{ name: "Cari Dokter", spec: "### Tujuan\nB\n" }],
    });
    expect(system).toContain("steps");
    expect(prompt).toContain("Spesifikasi fitur:\n### Tujuan\nA");
    expect(prompt).toContain("Spesifikasi sub-fitur Cari Dokter:");
  });
});

describe("perakit Markdown", () => {
  it("spesifikasi: Tujuan lalu Yang dibutuhkan, bullet ganda dibuang", () => {
    expect(
      renderSpec("id", {
        goal: " Pasien bisa memesan. ",
        needs: ["- Layar jadwal", "• Validasi slot"],
      }),
    ).toBe(
      "### Tujuan\nPasien bisa memesan.\n\n### Yang dibutuhkan\n- Layar jadwal\n- Validasi slot\n",
    );
    expect(renderSpec("en", { goal: "G", needs: ["N"] })).toBe(
      "### Goal\nG\n\n### Requirements\n- N\n",
    );
  });

  it("prompt task berdiri sendiri: produk, fitur, teknologi, spesifikasi, langkah bernomor, kriteria", () => {
    const prompt = renderTaskPrompt(
      {
        language: "id",
        product: "Booking Klinik",
        feature: "Booking Dokter",
        phase: 1,
        tech: ["backend: Laravel"],
        spec: "### Tujuan\nPasien bisa memesan.\n",
      },
      {
        title: "Buat API booking",
        description: "Endpoint pemesanan.",
        steps: ["1. Buat tabel", "- Buat endpoint"],
        done: ["* Tes lulus"],
      },
    );
    expect(prompt).toBe(
      [
        'Kamu sedang mengerjakan produk "Booking Klinik", fitur "Booking Dokter" (Fase 1).',
        "Teknologi: backend: Laravel.",
        "",
        "Tugas: Buat API booking",
        "Endpoint pemesanan.",
        "",
        "Spesifikasi fitur:",
        "Tujuan\nPasien bisa memesan.",
        "",
        "Langkah:",
        "1. Buat tabel",
        "2. Buat endpoint",
        "",
        "Selesai bila:",
        "- Tes lulus",
        "",
        "Kerjakan hanya tugas ini, ikuti pola kode yang sudah ada, dan jelaskan singkat apa yang berubah.",
      ].join("\n"),
    );
  });

  it("tanpa teknologi pilihan: ikuti stack proyek; bahasa Inggris", () => {
    const prompt = renderTaskPrompt(
      { language: "en", product: "P", feature: "F", phase: null, tech: [], spec: "" },
      { title: "T", description: "D", steps: ["S"], done: ["X"] },
    );
    expect(prompt).toContain('feature "F".');
    expect(prompt).toContain("follow the stack and patterns already in this project");
  });
});

describe("mock dan cek eval", () => {
  it("keluaran mock lolos skema; cek eval menandai prompt dan langkah yang dangkal", () => {
    const spec = specOutputSchema.parse(mockSpec("id", input.feature));
    const tasks = tasksOutputSchema.parse(mockTasks("id", input.feature));
    expect(spec.subFeatures.map((s) => s.name)).toEqual(["Cari Dokter", "Pilih Jam"]);
    const checks = checkBuild(
      { name: "Booking Dokter", subFeatures: ["Cari Dokter", "Pilih Jam", "Hilang"] },
      spec,
      tasks,
      tasks.tasks.map(() => "terlalu pendek"),
    );
    const failed = checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed).toEqual([
      "semua sub-fitur berspesifikasi (nama sama)",
      "prompt 80-450 kata",
      "3-8 langkah per task",
    ]);
  });
});
