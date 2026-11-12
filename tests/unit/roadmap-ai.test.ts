import { describe, expect, it } from "vitest";
import { mockRoadmap, mockRoadmapPartials } from "@/features/roadmap/ai/roadmap.mock";
import {
  clip,
  completedFeatures,
  finalOrder,
  normalizeFeature,
} from "@/features/roadmap/ai/roadmap.normalize";
import { buildRoadmapPrompt } from "@/features/roadmap/ai/roadmap.prompt";
import {
  roadmapOutputSchema,
  TARGET_FEATURES,
  TARGET_SUB_FEATURES,
} from "@/features/roadmap/ai/roadmap.schema";
import { DEFAULT_ICON, resolveIcon } from "@/features/roadmap/icons";

const base = {
  idea: "Aplikasi booking klinik untuk pasien dan dokter",
  language: "id" as const,
  techStack: { backend: "ai-pilih" },
  extras: [],
  questionAnswers: {
    questions: [
      {
        id: "first_win",
        question: "Hal pertama yang harus bisa diselesaikan?",
        type: "single_choice" as const,
        options: ["Booking dokter", "Cari dokter"],
        required: true,
      },
      {
        id: "must_have_features",
        question: "Fitur wajib?",
        type: "multi_choice" as const,
        options: ["Bayar online", "Pengingat"],
        required: true,
      },
      {
        id: "main_advantage",
        question: "Keunggulan utama?",
        type: "single_choice" as const,
        options: ["Cepat"],
        required: true,
      },
    ],
    answers: {
      first_win: "Booking dokter",
      must_have_features: ["Bayar online", "Pengingat"],
      main_advantage: "",
    },
  },
};

describe("buildRoadmapPrompt", () => {
  it("memuat ide, jawaban yang diisi, dan target jumlah fitur", () => {
    const { system, prompt } = buildRoadmapPrompt(base);
    expect(prompt).toContain("Aplikasi booking klinik");
    expect(prompt).toContain("Jawaban: Booking dokter");
    expect(prompt).toContain("Jawaban: Bayar online, Pengingat");
    expect(system).toContain(`${TARGET_FEATURES.min}-${TARGET_FEATURES.max} fitur`);
    expect(system).toContain(`${TARGET_SUB_FEATURES.min}-${TARGET_SUB_FEATURES.max}`);
    expect(system).toContain("Bahasa Indonesia");
    // Hasil uji M2-06: tanpa aturan ini model memakai nama persona ("Klinik Dewi Booking").
    expect(system).toContain("Jangan memakai nama orang");
  });

  it("tidak menyebut pertanyaan yang dilewati, teknologi 'AI pilih', atau extras kosong", () => {
    const { prompt } = buildRoadmapPrompt(base);
    expect(prompt).not.toContain("Keunggulan utama");
    expect(prompt).not.toMatch(/teknologi pengguna|Fitur tambahan/);
  });

  it("menyebut teknologi pilihan dan extras, dan memakai bahasa plan", () => {
    const { system, prompt } = buildRoadmapPrompt({
      ...base,
      language: "en",
      techStack: { backend: "Laravel", database: "ai-pilih" },
      extras: ["Notifikasi WhatsApp"],
    });
    expect(system).toContain("English");
    expect(prompt).toContain("backend: Laravel");
    expect(prompt).not.toContain("database:");
    expect(prompt).toContain("Notifikasi WhatsApp");
  });

  it("tanpa jawaban sama sekali tetap menghasilkan prompt yang sah", () => {
    const { prompt } = buildRoadmapPrompt({
      ...base,
      questionAnswers: { questions: [], answers: {} },
    });
    expect(prompt).not.toContain("Jawaban klarifikasi");
  });
});

describe("mock roadmap", () => {
  it("lolos skema dan sesuai target untuk kedua bahasa", () => {
    for (const language of ["id", "en"] as const) {
      const data = roadmapOutputSchema.parse(mockRoadmap(language, "Judul"));
      expect(data.features.length).toBeGreaterThanOrEqual(TARGET_FEATURES.min);
      expect(data.features.length).toBeLessThanOrEqual(TARGET_FEATURES.max);
      for (const f of data.features) {
        expect(f.subFeatures.length).toBeGreaterThanOrEqual(TARGET_SUB_FEATURES.min);
        expect(f.subFeatures.length).toBeLessThanOrEqual(TARGET_SUB_FEATURES.max);
      }
    }
  });

  it("potongan parsial bertambah satu fitur tiap kali", () => {
    const data = mockRoadmap("id", "J");
    const partials = mockRoadmapPartials(data);
    expect(partials.map((p) => p.features?.length)).toEqual(
      data.features.map((_, i) => i + 1),
    );
  });
});

describe("completedFeatures", () => {
  const full = mockRoadmap("id", "J").features;

  it("mengabaikan fitur terakhir yang mungkin masih ditulis", () => {
    expect(completedFeatures({ features: full.slice(0, 3) })).toHaveLength(2);
    expect(completedFeatures({ features: full.slice(0, 1) })).toHaveLength(0);
  });

  it("aman untuk masukan yang belum berbentuk", () => {
    expect(completedFeatures(undefined)).toEqual([]);
    expect(completedFeatures({})).toEqual([]);
    expect(completedFeatures({ features: "x" })).toEqual([]);
    expect(completedFeatures({ title: "J" })).toEqual([]);
  });

  it("berhenti di fitur pertama yang belum lolos skema agar posisi tetap berurutan", () => {
    const broken = { ...full[1], subFeatures: [] };
    expect(
      completedFeatures({ features: [full[0], broken, full[2], full[3]] }),
    ).toHaveLength(1);
  });
});

describe("normalisasi", () => {
  it("clip merapikan spasi dan memotong dengan elipsis", () => {
    expect(clip("  a   b  ", 10)).toBe("a b");
    expect(clip("abcdefghij", 5)).toBe("abcd…");
    expect(clip("abcde", 5)).toBe("abcde");
  });

  it("normalizeFeature memotong nama panjang dan menebak ikon", () => {
    const result = normalizeFeature({
      name: `Pembayaran ${"x".repeat(200)}`,
      summary: "s",
      icon: "bukan-ikon",
      phase: 1,
      subFeatures: [{ name: "Kirim Pengingat", summary: "", icon: "" }],
    });
    expect(result.name.length).toBeLessThanOrEqual(80);
    expect(result.icon).toBe("payment");
    expect(result.subFeatures[0]?.icon).toBe("bell");
  });

  it("finalOrder memadatkan fase dan mengurutkan stabil", () => {
    expect(finalOrder([2, 5, 2, 3])).toEqual({
      order: [0, 2, 3, 1],
      phases: [1, 3, 1, 2],
    });
    expect(finalOrder([1, 1, 2])).toEqual({ order: [0, 1, 2], phases: [1, 1, 2] });
    expect(finalOrder([])).toEqual({ order: [], phases: [] });
  });
});

describe("resolveIcon", () => {
  it("memakai ikon dikenal apa adanya", () => {
    expect(resolveIcon("calendar", "apa saja")).toBe("calendar");
  });

  it("menebak dari kata kunci nama (id dan en)", () => {
    expect(resolveIcon(null, "Pengingat Jadwal Kontrol")).toBe("bell");
    expect(resolveIcon(null, "Booking Dokter")).toBe("calendar");
    expect(resolveIcon("", "Notifikasi Email")).toBe("bell");
    expect(resolveIcon("x", "Admin Klinik")).toBe("settings");
    expect(resolveIcon(undefined, "Online Payment")).toBe("payment");
    expect(resolveIcon(undefined, "Ulasan Pasien")).toBe("chat");
  });

  it("jatuh ke ikon bawaan bila tidak ada yang cocok", () => {
    expect(resolveIcon(null, "Zzz")).toBe(DEFAULT_ICON);
  });
});
