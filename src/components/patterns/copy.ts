/** Teks bersama untuk komponen pola. Teks khusus fitur ada di copy.ts fitur itu. */
export const patternCopy = {
  undo: "Urungkan",
  dismiss: "Tutup",
  steps: {
    collapsed: (count: number) => `${count} langkah selesai`,
    status: {
      pending: "Menunggu",
      running: "Berjalan",
      done: "Selesai",
      failed: "Gagal",
    },
    progress: (done: number, total: number) => `${done} dari ${total} langkah`,
  },
  copy: {
    done: "Disalin ke papan klip.",
    failed: "Gagal menyalin. Pilih teksnya lalu salin manual.",
  },
  streaming: {
    finished: "Teks selesai dibuat.",
  },
} as const;
