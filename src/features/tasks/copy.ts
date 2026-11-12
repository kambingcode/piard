/** Teks UI fitur task (kanban). */
export const tasksCopy = {
  errors: {
    notFound: "Task tidak ditemukan.",
    featureNotFound: "Fitur tidak ditemukan.",
    subFeature: "Task ditempelkan ke fitur utama, bukan sub-fitur.",
    saveFailed: "Status gagal disimpan. Coba lagi.",
    statusChanged: "Status task sudah berubah. Muat ulang papan lalu coba lagi.",
  },
  kanban: {
    title: "Kanban",
    meta: (done: number, total: number) => `${done} dari ${total} task selesai`,
    columns: { todo: "Todo", doing: "Dikerjakan", review: "Review", done: "Selesai" },
    columnCount: (n: number) => `${n} task`,
    emptyColumn: "Seret task ke sini.",
    moveLabel: (title: string) => `Pindahkan "${title}" ke`,
    select: (title: string) => `Pilih "${title}"`,
    copy: "Salin prompt",
    copyLabel: (title: string) => `Salin prompt: ${title}`,
    dragHint: "Seret kartu antarkolom, atau pakai menu status di tiap kartu.",
    bulk: {
      selected: (n: number) => `${n} task dipilih`,
      moveTo: "Pindahkan ke",
      apply: "Pindahkan",
      clear: "Batal pilih",
      done: (n: number) => `${n} task dipindahkan.`,
    },
    reset: {
      action: "Reset status",
      title: "Kembalikan semua task ke Todo?",
      body: "Status semua task di plan ini kembali ke Todo dan klaim agen dilepas. Isi task tidak berubah.",
      confirm: "Reset",
      cancel: "Batal",
      done: "Semua task kembali ke Todo.",
    },
    empty: {
      title: "Belum ada task",
      body: "Task disusun dari spesifikasi tiap fitur. Susun dulu di halaman spesifikasi & task.",
      action: "Buka spesifikasi & task",
    },
  },
} as const;
