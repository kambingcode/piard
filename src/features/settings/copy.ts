/** Teks UI fitur pengaturan. */
export const settingsCopy = {
  title: "Pengaturan",
  intro:
    "Model AI per tugas dan batas biaya. Berlaku untuk semua plan mulai panggilan AI berikutnya, tanpa mulai ulang server.",
  mode: {
    mock: "LLM_MODE=mock: AI memakai jawaban contoh tanpa jaringan dan tanpa biaya. Model di bawah hanya label sampai LLM_MODE=openrouter.",
    live: "LLM_MODE=openrouter: panggilan AI memakai model di bawah dan ditagih ke kunci API Anda.",
  },
  models: {
    heading: "Model per tugas",
    hint: "ID OpenRouter (vendor/model, mis. anthropic/claude-haiku-5.5) atau ID API Anthropic (claude-…) yang dipanggil langsung dengan ANTHROPIC_API_KEY.",
    tasks: {
      questions: "Pertanyaan wizard",
      roadmap: "Roadmap",
      prd: "PRD",
      spec: "Spesifikasi",
      tasks: "Task",
      chat: "Chat revisi",
      codebase: "Analisis proyek eksisting",
    },
    env: (value: string) => `.env: ${value}`,
  },
  budget: {
    heading: "Batas biaya",
    hint: "Dalam USD, untuk seluruh aplikasi. Kosongkan untuk tanpa batas. Saat tercapai, job AI baru ditolak.",
    daily: "Harian (USD)",
    monthly: "Bulanan (USD)",
    unlimited: "Tanpa batas",
    env: (value: string) => `.env: ${value}`,
    invalid: "Isi angka lebih dari 0, atau kosongkan untuk tanpa batas.",
  },
  keys: {
    heading: "Kunci API",
    hint: "Diisi di app/.env lalu mulai ulang server. Nilainya tidak pernah ditampilkan.",
    openrouter: "OPENROUTER_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    set: "Terisi",
    unset: "Belum diisi",
  },
  changed: "Diubah di sini",
  save: "Simpan",
  saving: "Menyimpan…",
  saved: "Pengaturan disimpan. Berlaku mulai panggilan AI berikutnya.",
  reset: {
    action: "Pakai nilai .env",
    title: "Kembali ke nilai .env?",
    body: "Model dan batas biaya yang diubah di sini dihapus; nilai dari app/.env berlaku lagi.",
    confirm: "Pakai nilai .env",
    cancel: "Batal",
    done: "Nilai .env berlaku lagi.",
  },
  errors: {
    missingKey: (key: string) =>
      `${key} belum diisi di .env, jadi model ini tidak bisa dipanggil. Isi kuncinya lalu mulai ulang server, atau pilih model penyedia lain.`,
  },
} as const;
