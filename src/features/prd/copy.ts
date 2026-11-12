/** Teks UI fitur PRD. */
export const prdCopy = {
  documentLabel: "Dokumen PRD",
  meta: (version: number, when: string) => `Versi ${version} · disimpan ${when}`,
  next: "Lanjutkan ke spesifikasi & task",
  progress: {
    title: "Menyusun PRD",
    reviseTitle: "Merevisi PRD",
    steps: {
      thinking: "Membaca roadmap dan menyusun kerangka",
      writing: "Menulis bagian PRD",
      saving: "Menyimpan sebagai versi baru",
    },
    queued: "Menunggu giliran",
    sections: (n: number, total: number) => `${n}/${total} bagian`,
    elapsed: (seconds: number) => `${seconds} dtk`,
    hint: "Model gratis biasanya berpikir 30-60 detik sebelum teks pertama muncul. Halaman ini boleh ditinggal; PRD tetap dibuat.",
  },
  failed: {
    title: "PRD belum selesai dibuat",
    reviseTitle: "Revisi PRD belum berhasil",
    retry: "Coba lagi",
    keptVersion: (version: number) => `Versi ${version} sebelumnya tetap tersimpan.`,
  },
  empty: {
    title: "PRD belum dibuat",
    body: "PRD disusun dari ide, jawaban klarifikasi, dan roadmap Anda: tujuh bagian, termasuk diagram alur dan skema database.",
    action: "Buat PRD",
  },
  toolbar: {
    regenerate: "Buat ulang",
    versionLabel: "Versi",
    versionOption: (version: number, latest: boolean) =>
      latest ? `v${version} (terbaru)` : `v${version}`,
    modeLabel: "Tampilan PRD",
    preview: "Pratinjau",
    download: "Unduh .md",
    edit: "Edit",
  },
  editor: {
    label: "Isi PRD (Markdown)",
    previewLabel: "Pratinjau",
    save: "Simpan",
    saving: "Menyimpan…",
    cancel: "Batal",
    hint: "Ctrl/⌘ + S untuk menyimpan. Setiap simpan menjadi versi baru.",
    saved: (version: number) => `Tersimpan sebagai versi ${version}.`,
    unchanged: "Tidak ada perubahan untuk disimpan.",
    leaveWarning: "Perubahan PRD belum disimpan.",
    discardTitle: "Buang perubahan?",
    discardBody: "Suntingan yang belum disimpan akan hilang.",
    discardConfirm: "Buang",
    keepEditing: "Lanjut edit",
  },
  diff: {
    label: (from: number, to: number) => `Perbedaan versi ${from} dan ${to}`,
    summary: (added: number, removed: number, from: number, to: number) =>
      `Dari versi ${from} ke ${to}: ${added} baris ditambah, ${removed} baris dihapus.`,
    identical: "Isi versi ini sama dengan versi terbaru.",
    collapsed: (count: number) => `… ${count} baris sama`,
    addedLine: "Ditambah: ",
    removedLine: "Dihapus: ",
  },
  history: {
    viewing: (version: number, latest: number) =>
      `Anda melihat versi ${version} dari ${latest}. Versi ini hanya bisa dibaca.`,
    restore: "Pulihkan versi ini",
    backToLatest: "Kembali ke versi terbaru",
    showDocument: "Dokumen",
    showDiff: "Bandingkan dengan terbaru",
    modeLabel: "Tampilan versi lama",
    restored: (from: number, to: number) =>
      `Versi ${from} dipulihkan sebagai versi ${to}.`,
    loadFailed: "Versi ini gagal dimuat. Coba lagi.",
  },
  regenerateConfirm: {
    title: "Buat ulang PRD?",
    body: "AI menulis PRD baru dari roadmap saat ini. Hasilnya menjadi versi berikutnya; versi sekarang tetap ada di riwayat.",
    confirm: "Buat ulang",
    cancel: "Batal",
  },
  diagram: {
    rendering: "Menggambar diagram",
    invalid: "Diagram ini tidak bisa digambar. Sumbernya ditampilkan apa adanya.",
    label: (kind: string) => `Diagram ${kind}`,
  },

  errors: {
    noRoadmap: "Buat roadmap dulu. PRD disusun dari fitur di roadmap.",
    roadmapGenerating: "Roadmap masih dibuat. Tunggu sampai selesai, lalu buat PRD.",
    incomplete: (missing: string) =>
      `PRD dari AI belum lengkap (${missing}). Coba lagi; bila berulang, ganti MODEL_PRD di .env.`,
    empty: "AI tidak menulis apa pun. Coba lagi sebentar lagi.",
    failed: "PRD belum selesai dibuat. Coba lagi.",
    cancelled: "Pembuatan PRD dibatalkan.",
    generating: "PRD sedang dibuat. Tunggu sampai selesai sebelum menyimpan perubahan.",
    versionNotFound: "Versi PRD tidak ditemukan.",
    noDocument: "PRD belum ada. Buat PRD dulu.",
    noRevision: "Tidak ada revisi untuk diulang. Tulis permintaan perubahan di chat.",
  },
  missing: {
    title: "judul",
    sections: (numbers: number[]) => `bagian ${numbers.join(", ")}`,
    sequence: "diagram sequenceDiagram",
    er: "diagram erDiagram",
  },
} as const;
