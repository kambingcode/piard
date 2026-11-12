/** Teks UI fitur plans (landing /plan, daftar, wizard). */
export const plansCopy = {
  palette: {
    title: "Cari dan perintah",
    placeholder: "Cari plan atau perintah…",
    empty: "Tidak ada yang cocok.",
    loadFailed: "Daftar plan gagal dimuat; perintah lain tetap bisa dipakai.",
    hint: "↑ ↓ pilih · Enter buka · Esc tutup · Ctrl/⌘ K buka di mana saja",
    groups: { current: "Plan ini", go: "Pindah ke", plans: "Plan lain" },
    views: {
      roadmap: "Buka struktur",
      prd: "Buka PRD",
      tasks: "Buka spesifikasi & task",
      kanban: "Buka kanban",
      usage: "Buka pemakaian AI",
    },
    exportMd: "Unduh PRD (.md)",
    exportZip: "Unduh ZIP (PRD dan fitur)",
    newPlan: "Plan baru",
    allPlans: "Semua plan",
    settings: "Pengaturan",
  },
  cancelJob: {
    action: "Batalkan",
    pending: "Membatalkan…",
  },
  planNav: {
    label: "Bagian plan",
    roadmap: "Struktur",
    prd: "PRD",
    tasks: "Spesifikasi & task",
    kanban: "Kanban",
    usage: "Pemakaian",
  },
  landing: {
    title: "Mau bikin apa hari ini?",
    subtitle:
      "Tulis idenya. Piard menyusunnya menjadi PRD, roadmap, dan task yang siap ditempel ke AI coding agent.",
    newProject: {
      title: "Proyek baru",
      body: "Mulai dari satu paragraf ide. Piard bertanya lima hal singkat lalu menyusun rencananya.",
      action: "Mulai dengan ide",
    },
    existingProject: {
      title: "Proyek eksisting",
      body: "Analisis codebase yang sudah berjalan menjadi dokumentasi, lalu rencanakan fitur barunya.",
      action: "Analisis codebase",
    },
    resume: {
      title: "Lanjutkan plan terakhir",
      emptyTitle: "Belum ada plan",
      emptyBody:
        "Plan yang Anda buat muncul di sini, lengkap dengan langkah terakhirnya.",
    },
  },
  ideaForm: {
    title: "Mau bikin apa?",
    subtitle:
      "Satu paragraf cukup. Makin jelas siapa penggunanya dan apa masalahnya, makin tajam hasilnya.",
    label: "Ide aplikasi",
    placeholder:
      "Contoh: aplikasi booking klinik untuk pasien dan dokter, lengkap dengan pembayaran online dan pengingat jadwal.",
    languageLabel: "Bahasa hasil",
    languages: { id: "Bahasa Indonesia", en: "English" },
    submit: "Buat rencana",
    submitting: "Membuat rencana…",
    draftRestored: "Draf ide terakhir dipulihkan dari browser ini.",
    shortcut: "Ctrl/⌘ + Enter untuk mengirim",
    examplesTitle: "Atau mulai dari contoh",
    existing: "Sudah punya aplikasi yang berjalan?",
    feature: {
      title: "Mau menambah apa?",
      subtitle: (name: string) =>
        `Fitur baru untuk ${name}. Piard memakai dokumentasi proyek ini, jadi rencananya menyambung ke kode yang sudah ada.`,
      label: "Fitur yang ingin ditambahkan",
      placeholder:
        "Contoh: pengguna bisa menyimpan produk favorit dan menerima notifikasi saat harganya turun.",
    },
    existingLink: "Analisis codebase Anda",
    examples: [
      "Aplikasi booking klinik untuk pasien dan dokter, dengan pembayaran online dan pengingat jadwal lewat WhatsApp.",
      "Pencatat pengeluaran harian untuk freelancer: kategori otomatis, laporan bulanan, dan target tabungan.",
      "Platform kursus online kecil: guru unggah video, murid belajar bertahap, ada kuis dan sertifikat.",
    ],
    counter: (used: number, max: number) => `${used}/${max}`,
  },
  wizard: {
    fromCodebase: "Fitur baru untuk proyek",
    /** Nama langkah menurut urutan (langkah 1 = indeks 0). */
    steps: ["Ide", "Teknologi", "Pertanyaan", "Struktur"],
    stepperLabel: "Langkah penyusunan rencana",
    stepOf: (step: number, total: number) => `Langkah ${step} dari ${total}`,
    back: "Kembali",
    next: "Lanjut",
    idea: {
      title: "Ide Anda",
      languageLabel: "Bahasa hasil",
      body: "Ide disimpan apa adanya dan dipakai di semua langkah berikutnya.",
    },
  },
  tech: {
    title: "Preferensi teknologi",
    subtitle:
      "Pilih sendiri atau biarkan AI memutuskan. Bisa diubah kapan saja sebelum PRD dibuat.",
    modeAi: {
      title: "Biarkan AI pilih",
      body: "Piard memilih tumpukan teknologi yang paling cocok untuk idenya.",
    },
    modeOwn: {
      title: "Pilih sendiri",
      body: "Tentukan teknologi yang ingin dipakai; sisanya diserahkan ke AI.",
    },
    areas: {
      backend: "Backend",
      database: "Database",
      frontend: "Frontend",
      deployment: "Deployment",
    },
    aiChoice: "Biarkan AI pilih",
    extrasTitle: "Fitur tambahan",
    extrasHint: "Opsional. Dipertimbangkan saat menyusun pertanyaan dan roadmap.",
    next: "Lanjut ke pertanyaan",
    locked: {
      title: (name: string) => `Teknologi dari proyek ${name}`,
      body: "Terdeteksi dari codebase yang sudah ada, jadi fitur baru dibangun dengan teknologi yang sama.",
      unlock: "Buka kunci",
      confirmTitle: "Ubah teknologi proyek?",
      confirmBody:
        "Fitur baru biasanya memakai teknologi yang sama dengan proyeknya. Buka kunci hanya bila Anda memang ingin teknologi lain.",
      confirm: "Buka kunci",
      cancel: "Batal",
    },
  },
  saveStatus: {
    dirty: "Belum tersimpan",
    saving: "Menyimpan…",
    saved: "Tersimpan",
    error: "Gagal menyimpan. Perubahan akan dicoba lagi.",
  },
  list: {
    title: "Semua plan",
    empty: {
      title: "Belum ada plan",
      body: "Mulai dari satu paragraf ide.",
      action: "Buat plan baru",
    },
    stepLabel: (step: number, total: number, name: string) =>
      `Langkah ${step} dari ${total} · ${name}`,
  },
  actions: {
    delete: (title: string) => `Hapus plan "${title}"`,
    deleted: (title: string) => `Plan "${title}" dihapus.`,
    deleteFailed: "Plan gagal dihapus. Coba lagi.",
    resume: "Lanjutkan",
    newPlan: "Plan baru",
  },
  errors: {
    codebaseNotFound: "Proyek eksisting tidak ditemukan atau sudah dihapus.",
    generic: "Terjadi kesalahan. Coba lagi sebentar lagi.",
    ideaRequired: "Tulis idenya dulu.",
    ideaTooLong: (max: number) => `Ide terlalu panjang (maksimal ${max} karakter).`,
    emptyPatch: "Tidak ada perubahan yang dikirim.",
    instructionsTooLong: (max: number) =>
      `Instruksi untuk agen terlalu panjang (maks. ${max.toLocaleString("id-ID")} karakter).`,
    notFound: "Plan tidak ditemukan.",
  },
  history: {
    emptyTitle: "Belum ada riwayat",
    emptyBody: "Plan yang Anda buat tersimpan di sini.",
    groups: {
      today: "Hari ini",
      yesterday: "Kemarin",
      week: "7 hari terakhir",
      month: "30 hari terakhir",
      older: "Lebih lama",
    },
  },
} as const;
