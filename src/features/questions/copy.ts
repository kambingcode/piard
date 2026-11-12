/** Teks UI fitur pertanyaan klarifikasi (langkah 3 wizard). */
export const questionsCopy = {
  title: "Beberapa pertanyaan",
  progress: (current: number, total: number) => `Pertanyaan ${current} dari ${total}`,
  progressLabel: "Kemajuan pertanyaan",
  generating: {
    title: "Menyusun pertanyaan",
    steps: ["Membaca ide Anda", "Menyusun lima pertanyaan yang pas"],
    hint: "Biasanya beberapa detik.",
  },
  failed: { title: "Pertanyaan belum berhasil dibuat", retry: "Coba lagi" },
  other: "Lainnya",
  otherPlaceholder: "Tulis jawaban Anda",
  textPlaceholder: "Tulis jawaban Anda di sini",
  multiHint: "Pilih lebih dari satu bila perlu.",
  skip: "Lewati",
  back: "Kembali",
  next: "Lanjut",
  finish: "Bikin Struktur",
  keyboardHint: "Tekan angka untuk memilih, Enter untuk lanjut.",
  saveFailed: "Jawaban belum tersimpan. Periksa koneksi lalu coba lagi.",
} as const;
