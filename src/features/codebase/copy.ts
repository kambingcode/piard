/** Teks UI dan pesan galat fitur codebase (proyek eksisting). */
export const codebaseCopy = {
  errors: {
    notFound: "Proyek tidak ditemukan atau sudah dihapus.",
    docNotFound: "Halaman dokumentasi ini belum ada.",
    docVersionNotFound: "Versi halaman ini tidak ditemukan.",
    wrongSource: (source: string) =>
      `Proyek ini memakai sumber "${source}". Upload ZIP hanya untuk proyek bersumber ZIP.`,
    wrongSourceGithub: (source: string) =>
      `Proyek ini memakai sumber "${source}". URL GitHub hanya untuk proyek bersumber GitHub.`,
    busy: "Analisis sedang berjalan. Tunggu sampai selesai sebelum mengirim sumber baru.",
    busyDocs:
      "Analisis sedang berjalan. Tunggu sampai selesai sebelum mengubah dokumentasi.",
    proposalNotFound:
      "Tidak ada usulan untuk halaman ini (mungkin sudah diterima atau ditolak).",
    noDocs: "Belum ada dokumentasi untuk diunduh.",
  },
  zip: {
    empty: "Tidak ada berkas yang dikirim. Pilih berkas .zip dari folder proyek.",
    tooLarge: (mb: number) =>
      `Ukuran ZIP melebihi batas ${mb} MB. Buang node_modules, folder build, dan berkas media, lalu coba lagi.`,
    not_zip: "Berkas ini bukan ZIP. Unggah arsip .zip dari folder proyek.",
    archiveEmpty: "ZIP ini kosong.",
    too_many_entries:
      "ZIP berisi terlalu banyak berkas (lebih dari 20.000). Buang folder dependensi dan build, lalu coba lagi.",
    extracted_too_large:
      "Isi ZIP terlalu besar setelah diekstrak (lebih dari 200 MB). Kemungkinan ada berkas data besar atau arsip yang tidak wajar.",
    unsafe_path: (reason: string) =>
      `ZIP ini berisi jalur berkas yang tidak aman (${reason}). Buat ulang arsip dari folder proyek.`,
    corrupt: "ZIP ini rusak atau terpotong. Buat ulang arsipnya, lalu coba lagi.",
    noCode:
      "Tidak ada berkas kode yang bisa dibaca di ZIP ini. Semuanya dilewati (dependensi, hasil build, biner, atau kunci).",
  },
  analysis: {
    sourceExpired:
      "Sumber kode sudah tidak tersedia (kedaluwarsa setelah 24 jam, atau sudah dihapus setelah analisis). Unggah ZIP atau kirim URL GitHub lagi.",
    busy: "Analisis sedang berjalan.",
    notRetryable: "Tidak ada analisis gagal yang bisa dicoba lagi.",
    notRunning: "Tidak ada analisis yang sedang berjalan.",
    failed:
      "Analisis gagal karena kesalahan tak terduga. Coba lagi; langkah yang sudah selesai tidak diulang.",
    cancelled: "Analisis dibatalkan. Sumber sementara sudah dihapus.",
    interrupted: "Analisis berhenti (server dimulai ulang terlalu sering). Coba lagi.",
    phases: {
      queued: "Menunggu giliran",
      profile: "Membaca repo",
      summarize: "Meringkas",
      pages: "Menyusun dokumentasi",
      done: "Selesai",
    },
    confirm: {
      cost: (usd: string) =>
        `Perkiraan biaya US$${usd} melebihi ambang konfirmasi US$0,50.`,
      budget: (usd: string, remaining: string) =>
        `Perkiraan biaya US$${usd} lebih dari 20% sisa anggaran bulanan (US$${remaining}).`,
      unknownPrice: (model: string) =>
        `Harga model ${model} baru diketahui setelah dijalankan; perkiraan hanya dalam token.`,
    },
  },
  agent: {
    /** Satu pesan untuk semua penolakan token agar tidak membocorkan alasan (salah/kedaluwarsa/dicabut). */
    unauthorized:
      "Token agen tidak valid, kedaluwarsa, atau sudah dicabut. Buat token baru di halaman proyek Piard.",
    rateLimited: (minutes: number) =>
      `Terlalu banyak kiriman dengan token ini. Coba lagi dalam ±${minutes} menit.`,
    tooLarge:
      "Kiriman melebihi 1 MB. Persingkat halaman (maks. 40.000 karakter per halaman).",
    empty: 'Badan kiriman kosong. Kirim JSON {"pages": [{"slug", "content"}]}.',
    notJson: "Badan kiriman bukan JSON yang valid.",
    busy: "Analisis server sedang berjalan untuk proyek ini. Coba kirim lagi setelah selesai.",
    import: {
      noMarkers:
        "Tidak ada halaman yang terbaca. Setiap halaman harus diawali penanda <!-- piard:page slug --> di baris tersendiri.",
      unknownSlug: (slug: string) =>
        `Halaman "${slug}" tidak dikenal. Pakai slug standar: ringkasan, teknologi, struktur-folder, arsitektur, modul, data, api, alur-utama, menjalankan, catatan.`,
      duplicateSlug: (slug: string) => `Halaman "${slug}" muncul lebih dari sekali.`,
      tooLong: (slug: string) => `Halaman "${slug}" melebihi 40.000 karakter.`,
    },
  },
  github: {
    url: {
      empty: "Isi URL repo GitHub, mis. github.com/pemilik/repo.",
      not_github:
        "Ini bukan URL GitHub. Pakai alamat seperti github.com/pemilik/repo (host lain tidak didukung).",
      credentials:
        "Jangan sertakan nama pengguna atau token di URL. Untuk repo privat, isi token di kolom terpisah.",
      invalid_repo: "Nama pemilik atau repo di URL ini tidak valid.",
      unsupported_path:
        "Pakai URL repo (github.com/pemilik/repo) atau folder (…/tree/cabang/folder), bukan halaman lain.",
    },
    notFound:
      "Repo tidak ditemukan. Periksa URL-nya; bila repo privat, isi token akses pribadi GitHub.",
    notFoundWithToken:
      "Repo tidak ditemukan, atau token ini tidak punya akses ke repo tersebut.",
    tokenFormat: "Token GitHub hanya berisi huruf, angka, dan garis bawah.",
    badToken:
      "Token GitHub ditolak (salah atau kedaluwarsa). Buat token baru lalu coba lagi.",
    forbidden: "GitHub menolak akses ke repo ini.",
    rateLimited: (minutes: number) =>
      `Batas permintaan GitHub tercapai. Coba lagi dalam ±${minutes} menit, atau isi token akses pribadi.`,
    refNotFound: (ref: string) =>
      `Cabang, tag, atau commit "${ref}" tidak ada di repo ini.`,
    folderNotFound: (folder: string) =>
      `Folder "${folder}" tidak ada di repo ini (atau tidak berisi berkas).`,
    emptyRepo: "Repo ini masih kosong (belum ada commit).",
    tooLarge: (mb: number) =>
      `Arsip repo melebihi batas ${mb} MB. Pilih subfolder (…/tree/cabang/folder) atau unggah ZIP tanpa berkas besar.`,
    emptyDownload: "GitHub mengirim arsip kosong. Coba lagi sebentar lagi.",
    timeout: "GitHub terlalu lama merespons. Coba lagi sebentar lagi.",
    unreachable: "GitHub tidak bisa dihubungi. Periksa koneksi server, lalu coba lagi.",
    unexpected: "GitHub memberi jawaban yang tidak dikenal. Coba lagi sebentar lagi.",
  },
  skipped: {
    ignored_dir: "folder dependensi/build",
    lockfile: "lockfile",
    generated: "hasil generate",
    binary: "biner/media",
    private_key: "kunci privat/kredensial",
    too_large: "lebih dari 1 MB",
    too_many: "melebihi 5.000 berkas",
    unsupported: "kompresi tidak didukung",
  },
  ui: {
    nav: "Proyek eksisting",
    flow: {
      title: "Analisis proyek eksisting",
      subtitle:
        "Piard membaca codebase Anda dan menyusun dokumentasi 10 halaman yang bisa diedit, lalu dipakai untuk merencanakan fitur baru.",
      name: "Nama proyek",
      namePlaceholder: "mis. Toko Daring",
      nameRequired: "Isi nama proyek.",
      language: "Bahasa dokumentasi",
      languages: { id: "Indonesia", en: "Inggris" },
      sourceLegend: "Sumber kode",
      sources: {
        agent: {
          title: "Prompt untuk agen",
          body: "Claude Code di komputer Anda membaca repo dan mengirim dokumentasinya. Tanpa biaya model di Piard.",
        },
        zip: {
          title: "Upload ZIP",
          body: "Unggah arsip folder proyek (maks. {mb} MB). Piard menyaring dan menyensor rahasia sebelum menganalisis.",
        },
        github: {
          title: "URL GitHub",
          body: "Repo publik, cabang, atau subfolder. Repo privat bisa dengan token akses yang tidak disimpan.",
        },
      },
      agentNext:
        "Setelah dibuat, Anda mendapat prompt dan token sekali pakai untuk ditempel ke Claude Code.",
      submit: { agent: "Buat dan lihat prompt", zip: "Unggah", github: "Ambil repo" },
      working: { agent: "Membuat…", zip: "Mengunggah…", github: "Mengambil repo…" },
      back: "Kembali",
      backHref: "/plan",
    },
    zip: {
      label: "Berkas ZIP",
      hint: "Buang node_modules dan folder build lebih dulu agar ukurannya kecil.",
      choose: "Pilih berkas .zip",
      chosen: (name: string, size: string) => `${name} (${size})`,
      required: "Pilih berkas .zip dulu.",
      limit: (mb: number) => `Maks. ${mb} MB.`,
    },
    github: {
      url: "URL repo GitHub",
      urlPlaceholder: "github.com/pemilik/repo",
      urlHint: "Bisa juga …/tree/cabang/folder untuk satu subfolder.",
      privateToggle: "Repo privat? Pakai token akses",
      token: "Token akses pribadi (opsional)",
      tokenHint:
        "Hanya dipakai untuk satu unduhan ini, tidak disimpan dan tidak dicatat. Cukup izin baca isi repo.",
    },
    header: {
      source: (label: string) => `Sumber: ${label}`,
      planFeature: "Rencanakan fitur baru",
      reanalyze: "Analisis ulang",
      downloadAll: "Unduh semua (.zip)",
      delete: "Hapus proyek",
      rename: "Ubah nama",
    },
    status: {
      title: "Status",
      agentWaiting: "Menunggu hasil dari agen",
      agentWaitingBody:
        "Buat token, salin prompt, lalu tempel ke Claude Code yang terbuka di folder proyek. Halaman ini diperbarui otomatis saat hasilnya masuk.",
      reanalyzeTitle: "Kirim sumber baru",
      reanalyzeBody:
        "Hasil baru menjadi versi baru. Halaman yang pernah Anda edit tidak ditimpa: hasilnya muncul sebagai usulan.",
      sourceReady: "Sumber diterima",
      estimateTitle: "Perkiraan biaya analisis",
      estimate: (files: number, calls: number) =>
        `${files} berkas, ${calls} panggilan model`,
      estimateTokens: (input: string, output: string) =>
        `±${input} token masuk, ±${output} keluar`,
      estimateCost: (usd: string) => `±US$${usd}`,
      estimateUnknown: "Harga belum diketahui",
      estimateNote: (model: string) =>
        `Model ${model}. Biaya nyata tercatat setelah selesai.`,
      truncated: (n: number, dropped: number) =>
        `${n} berkas dipotong${dropped > 0 ? `, ${dropped} tidak ikut` : ""} agar muat anggaran.`,
      start: "Mulai analisis",
      starting: "Memulai…",
      confirmTitle: "Lanjutkan analisis?",
      confirmAction: "Ya, mulai",
      confirmCancel: "Batal",
      expired: "Sumber kedaluwarsa. Unggah ulang untuk menganalisis.",
      analyzing: "Menganalisis",
      phaseCount: (done: number, total: number) => `${done}/${total}`,
      cancel: "Batalkan",
      cancelling: "Membatalkan…",
      failed: "Analisis gagal",
      retry: "Coba lagi",
      retrying: "Mengulang…",
      steps: {
        profile: "Membaca repo",
        summarize: "Meringkas berkas",
        pages: "Menyusun dokumentasi",
      },
      summaryTitle: "Perubahan dari analisis terakhir",
      summary: {
        added: (n: number) => `${n} halaman baru`,
        changed: (n: number) => `${n} berubah`,
        unchanged: (n: number) => `${n} tidak berubah`,
        proposed: (n: number) => `${n} usulan untuk halaman yang Anda edit`,
      },
    },
    agent: {
      tokenTitle: "Token agen",
      tokenActive: (until: string) => `Token aktif sampai ${until}.`,
      tokenNone: "Belum ada token aktif.",
      tokenOnce: "Token ini hanya ditampilkan sekali. Salin prompt sekarang.",
      create: "Buat token",
      createNew: "Buat token baru",
      creating: "Membuat…",
      revoke: "Cabut token",
      revoked: "Token dicabut.",
      promptTitle: "Prompt untuk Claude Code",
      promptHint:
        "Jalankan Claude Code di folder akar repo, tempel prompt ini, dan izinkan perintah curl saat diminta.",
      copyPrompt: "Salin prompt",
      copyNeedsToken: "Buat token dulu agar prompt bisa dipakai.",
      previewToggle: "Lihat isi prompt",
      localWarning:
        "Alamat Piard ini hanya bisa dijangkau dari komputer yang sama. Agen di mesin lain butuh APP_URL di .env.",
      pasteTitle: "Tempel hasil",
      pasteBody:
        "Bila agen tidak bisa mengirim lewat curl, minta ia menulis satu Markdown bersekat lalu tempel di sini.",
      pasteLabel: "Hasil dari agen",
      pasteSubmit: "Simpan hasil",
      pasting: "Menyimpan…",
      pasted: (n: number) => `${n} halaman disimpan.`,
      pastedProposed: (n: number) => `${n} halaman yang Anda edit menerima usulan.`,
    },
    docs: {
      navLabel: "Halaman dokumentasi",
      mobilePick: "Pilih halaman",
      missing: "Belum ada",
      missingTitle: "Halaman ini belum ada",
      missingBody:
        "Hasil analisis tidak memuat halaman ini. Anda bisa menulisnya sendiri.",
      write: "Tulis halaman",
      edit: "Ubah",
      editedBadge: "diedit",
      proposalBadge: "usulan",
      origin: (origin: string, version: number, date: string) =>
        `Versi ${version} · ${origin} · ${date}`,
      download: "Unduh .md",
      history: "Riwayat versi",
      viewing: (version: number) => `Melihat versi ${version} (lama).`,
      backToLatest: "Kembali ke terbaru",
      restore: "Pulihkan versi ini",
      restoring: "Memulihkan…",
      restored: (version: number) => `Versi ${version} dipulihkan sebagai versi terbaru.`,
      versionOption: (version: number, origin: string, date: string) =>
        `v${version} · ${origin} · ${date}`,
      saved: "Halaman disimpan sebagai versi baru.",
      busy: "Analisis sedang berjalan; edit setelah selesai.",
      empty: {
        title: "Dokumentasi belum ada",
        body: "Setelah analisis selesai atau agen mengirim hasilnya, halaman-halamannya muncul di sini.",
      },
    },
    editor: {
      label: "Isi halaman (Markdown)",
      hint: "Markdown + diagram mermaid. Ctrl/⌘ S untuk menyimpan, Esc untuk menutup.",
      draftRestored: "Draf yang belum tersimpan dipulihkan.",
      save: "Simpan",
      saving: "Menyimpan…",
      cancel: "Batal",
      previewLabel: "Pratinjau",
      discardTitle: "Buang perubahan?",
      discardBody: "Perubahan yang belum disimpan akan hilang.",
      keepEditing: "Lanjut mengedit",
      discardConfirm: "Buang",
    },
    proposal: {
      title: "Ada usulan dari analisis ulang",
      body: "Anda pernah mengedit halaman ini, jadi hasil baru tidak menggantikannya. Bandingkan lalu putuskan.",
      compare: "Bandingkan",
      current: (version: number) => `Versi Anda (v${version})`,
      proposed: (origin: string) => `Usulan (${origin})`,
      accept: "Terima usulan",
      reject: "Tolak",
      accepted: "Usulan diterima sebagai versi baru.",
      rejected: "Usulan ditolak; versi Anda tetap terbaru.",
    },
    info: {
      title: "Tentang proyek",
      stack: "Teknologi terdeteksi",
      noStack: "Belum terdeteksi",
      files: "Berkas dianalisis",
      filesValue: (n: number) => `${n} berkas teks`,
      analyzed: "Dianalisis",
      notYet: "Belum",
      redacted: (n: number, files: number) =>
        `${n} nilai rahasia disembunyikan di ${files} berkas sebelum dianalisis.`,
      skipped: "Dilewati",
      origins: "Asal halaman",
      truncated: (n: number, dropped: number) =>
        `Analisis terakhir: ${n} berkas dipotong${dropped > 0 ? `, ${dropped} tidak ikut` : ""} agar muat anggaran. Halaman bisa tidak lengkap untuk bagian itu.`,
      usage: "Biaya analisis terakhir",
      usageValue: (usd: string, calls: number) => `US$${usd} · ${calls} panggilan`,
      stackLabels: {
        languages: "Bahasa",
        frontend: "Frontend",
        backend: "Backend",
        database: "Database",
        deployment: "Deployment",
        tools: "Alat",
      },
    },
    list: {
      title: "Proyek eksisting",
      subtitle: "Codebase yang sudah dianalisis menjadi dokumentasi.",
      add: "Tambah proyek",
      emptyTitle: "Belum ada proyek eksisting",
      emptyBody:
        "Analisis codebase yang sudah berjalan untuk mendapatkan dokumentasi dan rencana lanjutan.",
      pages: (n: number) => `${n}/10 halaman`,
      deleted: (name: string) => `Proyek "${name}" dihapus.`,
      keptPlans: (n: number) =>
        `${n} plan fitur baru dari proyek ini tetap ada, kini tanpa tautan ke proyek.`,
      deleteFailed: "Proyek gagal dihapus. Coba lagi.",
      delete: (name: string) => `Hapus proyek ${name}`,
      sidebarTitle: "Proyek eksisting",
    },
  },
  status: {
    awaiting_source: "Menunggu sumber kode",
    source_ready: "Sumber diterima",
    analyzing: "Menganalisis",
    ready: "Dokumentasi siap",
    failed: "Gagal",
  },
  source: {
    agent: "Prompt agen",
    zip: "Upload ZIP",
    github: "URL GitHub",
  },
  origin: {
    agent: "agen",
    ai: "AI",
    manual: "manual",
  },
} as const;
