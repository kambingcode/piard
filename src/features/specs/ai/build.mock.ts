import type { PlanLanguage } from "@/features/plans";
import type { BuildFeature } from "./build.prompt";
import type { SpecOutput, TasksOutput } from "./build.schema";

const TEXT = {
  id: {
    goal: (name: string) =>
      `Pengguna bisa memakai ${name} dengan cepat dan tanpa bingung.`,
    needs: (name: string) => [
      `Layar utama ${name} yang ramah ponsel`,
      `Data ${name} tersimpan per pengguna`,
      "Validasi isian dengan pesan galat yang jelas",
    ],
    subGoal: (name: string) => `${name} bekerja sesuai kebutuhan pengguna.`,
    subNeeds: (name: string) => [`Tampilan ${name}`, `Aturan dan data untuk ${name}`],
    tasks: (name: string) => [
      {
        title: `Buat model data dan API ${name}`,
        description: `Tabel dan endpoint untuk ${name}. Selesai bila endpoint lulus tes.`,
        steps: [
          "Tambah tabel yang dibutuhkan.",
          "Buat endpoint baca dan tulis dengan validasi.",
          "Tulis tes integrasi.",
        ],
        done: ["Semua tes integrasi lulus."],
      },
      {
        title: `Buat layar ${name}`,
        description: `Antarmuka ${name} memakai API yang sudah ada. Selesai bila bisa dipakai di ponsel.`,
        steps: ["Tampilkan data dan state kosong.", "Tangani galat dengan pesan jelas."],
        done: ["Alur utama bisa dipakai di layar 390px."],
      },
      {
        title: `Uji alur ${name}`,
        description: `Tes ujung ke ujung untuk alur utama ${name}.`,
        steps: ["Buka layar, isi data, lalu simpan.", "Muat ulang halaman."],
        done: ["Hasilnya tetap tampil setelah muat ulang."],
      },
    ],
  },
  en: {
    goal: (name: string) => `Users can use ${name} quickly and without confusion.`,
    needs: (name: string) => [
      `A mobile-friendly ${name} screen`,
      `${name} data stored per user`,
      "Input validation with clear error messages",
    ],
    subGoal: (name: string) => `${name} works the way users need.`,
    subNeeds: (name: string) => [`${name} view`, `Rules and data for ${name}`],
    tasks: (name: string) => [
      {
        title: `Build ${name} data model and API`,
        description: `Tables and endpoints for ${name}. Done when the endpoint tests pass.`,
        steps: [
          "Add the tables.",
          "Add read and write endpoints with validation.",
          "Write integration tests.",
        ],
        done: ["All integration tests pass."],
      },
      {
        title: `Build ${name} screen`,
        description: `The ${name} UI on top of the API. Done when it works on mobile.`,
        steps: ["Show data and an empty state.", "Handle errors with clear messages."],
        done: ["The main flow works at 390px."],
      },
      {
        title: `Test the ${name} flow`,
        description: `End-to-end test for the main ${name} flow.`,
        steps: ["Open the screen, enter data, and save.", "Reload the page."],
        done: ["The result is still shown after reload."],
      },
    ],
  },
} as const;

/** Spesifikasi palsu deterministik untuk `LLM_MODE=mock`. */
export function mockSpec(language: PlanLanguage, feature: BuildFeature): SpecOutput {
  const t = TEXT[language];
  return {
    feature: { goal: t.goal(feature.name), needs: [...t.needs(feature.name)] },
    subFeatures: feature.subFeatures.map((s) => ({
      name: s.name,
      goal: t.subGoal(s.name),
      needs: [...t.subNeeds(s.name)],
    })),
  };
}

/** Task palsu deterministik untuk `LLM_MODE=mock`. */
export function mockTasks(language: PlanLanguage, feature: BuildFeature): TasksOutput {
  return {
    tasks: TEXT[language]
      .tasks(feature.name)
      .map((task) => ({ ...task, steps: [...task.steps], done: [...task.done] })),
  };
}
