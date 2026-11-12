/** Teks UI fitur revisi (chat PRD dan sinkronisasi). */
export const revisionCopy = {
  panel: {
    title: "Chat revisi",
    close: "Tutup chat",
    messagesLabel: "Percakapan revisi",
    syncLabel: "Penyesuaian dengan PRD",
    greeting:
      "PRD kamu sudah jadi. Kamu bisa tanya, minta saran, atau langsung minta edit.",
    suggestions: [
      "Apa risiko terbesar dari rencana ini?",
      "Tambahkan bagian keamanan data di kebutuhan",
      "Tambahkan fitur notifikasi pengingat",
    ],
    noPrd: "Chat tersedia setelah PRD selesai dibuat.",
  },
  composer: {
    label: "Pesan untuk AI",
    placeholder: "Minta perubahan atau tanya sesuatu…",
    send: "Kirim",
    stop: "Hentikan",
    hint: "Enter untuk mengirim, Shift + Enter untuk baris baru.",
    thinking: "AI sedang menulis…",
  },
  roles: { user: "Anda", assistant: "AI" },
  revision: {
    running: (summary: string) => `Merevisi PRD: ${summary}`,
    done: (version: number) => `PRD berhasil diupdate (versi ${version})`,
    failed: "Revisi PRD gagal",
  },
  proposal: {
    title: "Usulan perubahan fitur",
    syncTitle: "Penyesuaian fitur dengan PRD",
    ops: { add: "Ditambah", update: "Diubah", remove: "Dihapus" },
    phase: (n: number) => `Fase ${n}`,
    subFeatures: (n: number) => `${n} sub-fitur`,
    accept: "Terima",
    reject: "Tolak",
    accepted: "Diterima",
    rejected: "Ditolak",
    acceptedToast: (n: number) =>
      `${n} perubahan diterapkan ke roadmap. Spesifikasi & task fitur terkait perlu disesuaikan.`,
    rejectedToast: "Usulan ditolak. Roadmap tidak berubah.",
  },
  sync: {
    dirtyTitle: (version: number | null) =>
      version ? `PRD berubah (versi ${version})` : "PRD berubah",
    dirtyBody: "Fitur di roadmap mungkin belum sesuai dengan PRD terbaru.",
    reconcile: "Sesuaikan fitur dengan PRD",
    dismiss: "Abaikan",
    reconciling: "Membandingkan PRD dengan fitur…",
    upToDate: "Fitur sudah sesuai dengan PRD.",
    staleTasks: (n: number) =>
      `${n} fitur berubah. Spesifikasi & task-nya perlu disesuaikan di halaman Spesifikasi & task.`,
    openTasks: "Buka spesifikasi & task",
  },
  errors: {
    busy: "Balasan sebelumnya masih ditulis. Tunggu sampai selesai.",
    noPrd: "PRD belum ada. Buat PRD dulu sebelum memakai chat.",
    failed: "AI gagal membalas. Coba kirim lagi.",
    proposalNotFound: "Usulan tidak ditemukan.",
    proposalResolved: "Usulan ini sudah diputuskan.",
    noChanges: "Usulan tidak berisi perubahan yang valid untuk fitur di roadmap.",
    reconcileFailed: "Penyesuaian fitur gagal. Coba lagi.",
  },
} as const;
