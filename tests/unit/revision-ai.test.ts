import { describe, expect, it } from "vitest";
import { readSync } from "@/features/plans";
import { mockPrd, mockRevision } from "@/features/prd/ai/prd.mock";
import type { PrdPromptInput } from "@/features/prd/ai/prd.prompt";
import { buildRevisePrompt } from "@/features/prd/ai/revise.prompt";
import { checkPrdStructure } from "@/features/prd/structure";
import { normalizeChanges } from "@/features/revision/ai/changes.schema";
import { mockChat } from "@/features/revision/ai/chat.mock";
import {
  buildChatSystem,
  buildReconcilePrompt,
  TOOL_PROPOSE_CHANGES,
  TOOL_UPDATE_PRD,
} from "@/features/revision/ai/chat.prompt";
import { mockReconcile } from "@/features/revision/ai/reconcile.mock";

const targets = [
  { id: "f1", name: "Booking Jadwal", summary: "Pesan jadwal dokter.", phase: 1 },
  { id: "f2", name: "Pembayaran", summary: "Bayar di aplikasi.", phase: 2 },
];

const prdInput: PrdPromptInput = {
  idea: "Aplikasi booking klinik",
  language: "id",
  title: "Booking Klinik",
  techStack: {},
  extras: [],
  questionAnswers: { questions: [], answers: {} },
  features: targets.map((t) => ({ ...t, subFeatures: [] })),
};

describe("normalizeChanges", () => {
  it("membuang perubahan tidak sah dan menyalin keadaan sebelumnya", () => {
    const out = normalizeChanges(
      [
        {
          op: "add",
          name: "  Notifikasi  ",
          summary: "Pengingat",
          subFeatures: [{ name: "", summary: "x" }],
        },
        { op: "add", summary: "tanpa nama" },
        { op: "update", featureId: "f1", name: "Booking Jadwal" }, // tidak mengubah apa pun
        { op: "update", featureId: "f2", summary: "Bayar lewat QRIS." },
        { op: "remove", featureId: "f2" }, // fitur yang sama dua kali
        { op: "remove", featureId: "tidak-ada" },
        { op: "remove", featureId: "f1" },
      ],
      targets,
    );
    expect(out).toEqual([
      {
        op: "add",
        name: "Notifikasi",
        summary: "Pengingat",
        phase: null,
        subFeatures: [],
      },
      {
        op: "update",
        featureId: "f2",
        summary: "Bayar lewat QRIS.",
        before: { name: "Pembayaran", summary: "Bayar di aplikasi.", phase: 2 },
      },
      { op: "remove", featureId: "f1", name: "Booking Jadwal" },
    ]);
  });
});

describe("mock chat dan penyesuaian", () => {
  it("pertanyaan dijawab tanpa tool; permintaan ubah memakai updatePrd; fitur juga diusulkan", () => {
    expect(mockChat("Apa risikonya?").every((s) => "text" in s)).toBe(true);
    const edit = mockChat("Ubah bagian kebutuhan");
    expect(edit.flatMap((s) => ("tool" in s ? [s.tool] : []))).toEqual([TOOL_UPDATE_PRD]);
    const feature = mockChat("Tambahkan fitur notifikasi");
    expect(feature.flatMap((s) => ("tool" in s ? [s.tool] : []))).toEqual([
      TOOL_UPDATE_PRD,
      TOOL_PROPOSE_CHANGES,
    ]);
  });

  it("penyesuaian mock: PRD yang sama dengan roadmap tidak menghasilkan perubahan", () => {
    const prd = mockPrd(prdInput);
    expect(mockReconcile(prd, targets)).toEqual([]);
    const renamed = prd.replace("**Pembayaran**", "**Dompet Digital**");
    expect(mockReconcile(renamed, targets)).toEqual([
      { op: "add", name: "Dompet Digital", summary: "", subFeatures: [] },
      { op: "remove", featureId: "f2" },
    ]);
  });

  it("revisi mock menambah butir permintaan dan tetap lengkap", () => {
    const prd = mockPrd(prdInput);
    const revised = mockRevision(prd, "Tambahkan  audit log");
    expect(revised).toContain("- Tambahkan audit log\n\n## 3.");
    expect(checkPrdStructure(revised).missingSections).toEqual([]);
  });
});

describe("prompt", () => {
  it("prompt chat memuat id fitur, versi, dan kedua tool", () => {
    const system = buildChatSystem({
      language: "id",
      title: "Booking Klinik",
      prd: "# PRD - Booking Klinik",
      prdVersion: 3,
      features: targets.map((t) => ({ ...t, subFeatures: ["Kalender"] })),
    });
    expect(system).toContain("[id: f1, fase 1] Booking Jadwal");
    expect(system).toContain("Sub-fitur: Kalender.");
    expect(system).toContain("(versi 3)");
    expect(system).toContain(TOOL_UPDATE_PRD);
    expect(system).toContain(TOOL_PROPOSE_CHANGES);
    const reconcile = buildReconcilePrompt({
      language: "id",
      title: "Booking Klinik",
      prd: "isi PRD",
      features: [],
    });
    expect(reconcile.prompt).toContain("(belum ada fitur)");
  });

  it("prompt revisi membawa PRD saat ini, permintaan, dan aturan format yang sama", () => {
    const { system, prompt } = buildRevisePrompt({
      language: "id",
      title: "Booking Klinik",
      current: "# PRD - Booking Klinik\n\nisi",
      instructions: "Tambahkan audit log",
      features: prdInput.features,
    });
    expect(system).toContain("## 7. ");
    expect(system).toContain("Tulis ulang PRD utuh");
    expect(prompt).toContain("Perubahan yang diminta:\nTambahkan audit log");
    expect(prompt).toContain("PRD saat ini:\n\n# PRD - Booking Klinik");
  });
});

describe("readSync", () => {
  it("nilai kosong atau rusak dianggap bersih; data lain diabaikan", () => {
    expect(readSync({})).toEqual({
      prd: { dirty: false, version: null },
      staleFeatureIds: [],
    });
    expect(readSync({ prd: "rusak", staleFeatureIds: [1], totalPhases: 3 })).toEqual({
      prd: { dirty: false, version: null },
      staleFeatureIds: [],
    });
    expect(
      readSync({ prd: { dirty: true, version: 4 }, staleFeatureIds: ["a"] }),
    ).toEqual({ prd: { dirty: true, version: 4 }, staleFeatureIds: ["a"] });
  });
});
