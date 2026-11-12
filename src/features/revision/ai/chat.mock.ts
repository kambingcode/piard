import type { MockChatStep } from "@/server/ai";
import type { RawChange } from "./changes.schema";
import { TOOL_PROPOSE_CHANGES, TOOL_UPDATE_PRD } from "./chat.prompt";

/** Fitur contoh yang ditambahkan mock saat pengguna meminta fitur baru. */
export const MOCK_FEATURE = {
  name: "Notifikasi Pengingat",
  summary: "Mengirim pengingat lewat email dan notifikasi sebelum jadwal penting.",
  subFeatures: [
    {
      name: "Pengaturan Pengingat",
      summary: "Pengguna memilih kapan pengingat dikirim.",
    },
    { name: "Riwayat Notifikasi", summary: "Daftar pengingat yang sudah dikirim." },
  ],
};

/**
 * Skenario chat palsu (`LLM_MODE=mock`), ditentukan dari kata di pesan pengguna agar e2e bisa
 * memicu tiap jalur: "fitur" + kata kerja ubah → revisi PRD dan usulan fitur; kata kerja ubah saja →
 * revisi PRD; selain itu jawaban biasa.
 */
export function mockChat(text: string): MockChatStep[] {
  const lower = text.toLowerCase();
  const wantsEdit =
    /\b(tambah\w*|ubah|ganti|hapus|revisi|perbarui|add|change|remove)\b/.test(lower);
  const aboutFeature = /\bfitur\b|\bfeature\b/.test(lower);
  if (!wantsEdit) {
    return [
      {
        text: "Pertanyaan bagus. Risiko utamanya ada di adopsi awal: mulai dari satu kelompok pengguna, ukur pemakaian minggu pertama, lalu perluas. Minta saya mengubah PRD bila ingin mencatatnya.",
      },
    ];
  }
  const steps: MockChatStep[] = [
    { text: "Baik, saya perbarui PRD sesuai permintaan Anda." },
    {
      tool: TOOL_UPDATE_PRD,
      input: { instructions: text, summary: text.slice(0, 120) },
    },
  ];
  if (aboutFeature) {
    const change: RawChange = { op: "add", ...MOCK_FEATURE };
    steps.push(
      {
        text: " Saya juga mengusulkan fitur baru di roadmap; silakan terima atau tolak.",
      },
      { tool: TOOL_PROPOSE_CHANGES, input: { changes: [change] } },
    );
  }
  return steps;
}
