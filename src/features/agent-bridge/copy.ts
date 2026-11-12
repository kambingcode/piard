import type { TaskStatus } from "@/features/tasks";
import type { TaskEvent } from "./schemas";

const statusName: Record<TaskStatus, string> = {
  todo: "Todo",
  doing: "Dikerjakan",
  review: "Review",
  done: "Selesai",
};

/**
 * Teks fitur jembatan agen. Pesan `agent.*` dibaca agen coding (lewat API dan server MCP), jadi menyebut
 * langkah yang benar berikutnya dengan nama tool MCP.
 */
export const agentBridgeCopy = {
  errors: {
    tokenNotFound: "Token tidak ditemukan.",
    tooManyTokens: (max: number) =>
      `Plan ini sudah punya ${max} token aktif. Cabut token yang tidak dipakai dulu.`,
    tooManyNotes: (max: number) =>
      `Card ini sudah punya ${max} catatan. Lanjutkan percakapan di luar Piard atau minta pengguna merapikan card.`,
    notAgentCard: "Card ini tidak sedang dikerjakan agen.",
  },
  agent: {
    unauthorized:
      "Token Piard tidak valid, kedaluwarsa, atau sudah dicabut. Minta pengguna membuat token baru di halaman Kanban → Hubungkan AI.",
    rateLimited: (minutes: number) =>
      `Terlalu banyak permintaan dengan token ini. Coba lagi dalam ${minutes} menit.`,
    taskNotFound: "Task tidak ditemukan di plan ini.",
    tooLarge: "Isi permintaan terlalu besar (maks. 64 KB).",
    empty: "Isi permintaan kosong.",
    notJson: "Isi permintaan bukan JSON yang valid.",
    busy: (title: string, id: string) =>
      `Anda masih memegang task "${title}" (${id}). Selesaikan dengan report_task atau lepaskan dengan release_task sebelum mengklaim task lain.`,
    claimConflict: (status: TaskStatus) =>
      status === "doing"
        ? "Task ini sedang dikerjakan agen lain. Ambil task lain dengan get_next_task."
        : `Task berstatus ${statusName[status]}, hanya task Todo yang bisa diklaim. Ambil task lain dengan get_next_task.`,
    notYours: (status: TaskStatus) =>
      status === "doing"
        ? "Task ini dipegang agen lain; Anda hanya boleh mengubah task yang Anda klaim."
        : status === "review"
          ? "Task sudah dilaporkan dan menunggu tinjauan pengguna. Jangan mengubahnya lagi; ambil task lain dengan get_next_task."
          : `Task berstatus ${statusName[status]}. Klaim dulu dengan claim_task sebelum melapor, melepas, atau menulis catatan.`,
  },
  events: {
    claim: "Mengklaim card",
    report: "Melaporkan card siap ditinjau",
    release: "Melepas card kembali ke Todo",
    approve: "Menyetujui card",
    changes: "Meminta perbaikan; card kembali ke Todo",
    user_release: "Melepas card dari agen; card kembali ke Todo",
  } satisfies Record<TaskEvent, string>,
  report: {
    filesChanged: "Berkas diubah",
    verification: "Cara verifikasi",
  },
  ui: {
    card: {
      ai: (label: string) => `AI · ${label}`,
      aiUnknown: "AI",
      claimedAgo: (ago: string) => `diklaim ${ago}`,
      stale: "Mungkin macet",
      question: "AI butuh jawaban",
      notes: (n: number) => `${n} catatan`,
      detail: "Detail",
      detailLabel: (title: string) => `Detail dan catatan: ${title}`,
      approve: "Setujui",
      approveLabel: (title: string) => `Setujui "${title}"`,
      changes: "Minta perbaikan",
      release: "Lepas",
      releaseLabel: (title: string) => `Lepas "${title}" dari agen`,
      approved: "Card disetujui dan pindah ke Selesai.",
      released: "Card kembali ke Todo.",
    },
    detail: {
      title: "Detail card",
      close: "Tutup",
      status: "Status",
      feature: "Fitur",
      claimedBy: (label: string, at: string) => `Dikerjakan AI (${label}) sejak ${at}.`,
      staleHint:
        "Tidak ada kabar dari agen lebih dari 2 jam. Lepas card bila agen sudah berhenti.",
      description: "Deskripsi",
      prompt: "Prompt",
      copyPrompt: "Salin prompt",
      review: {
        title: "Tinjau hasil AI",
        body: "Periksa laporan di bawah dan hasilnya di repo. Setujui memindahkan card ke Selesai; Minta perbaikan mengembalikannya ke Todo dengan catatan untuk agen.",
        approve: "Setujui",
        changesLabel: "Yang perlu diperbaiki",
        changesPlaceholder:
          "Mis. validasi hari libur belum ada; tambahkan tes untuk zona waktu.",
        changesSubmit: "Minta perbaikan",
        changesSent: "Card kembali ke Todo dengan catatan perbaikan.",
      },
      timeline: "Linimasa",
      emptyTimeline:
        "Belum ada catatan. Laporan dan pertanyaan agen akan muncul di sini.",
      you: "Anda",
      agent: (label: string | null) => (label ? `AI · ${label}` : "AI"),
      kinds: {
        note: "Catatan",
        report: "Laporan",
        question: "Pertanyaan",
        event: "Peristiwa",
      },
      composer: {
        label: "Tulis catatan",
        answerLabel: "Jawab pertanyaan AI",
        placeholder: "Catatan untuk agen; terbaca lewat get_task.",
        submit: "Kirim",
        sent: "Catatan terkirim.",
      },
    },
    connect: {
      open: "Hubungkan AI",
      title: "Hubungkan AI ke kanban ini",
      close: "Tutup",
      intro:
        "Claude Code di komputer Anda bisa mengambil card Todo, mengerjakannya di repo, lalu melapor. Card yang dilaporkan masuk kolom Review; hanya Anda yang memindahkannya ke Selesai.",
      steps: {
        token: "1. Buat token",
        connect: "2. Hubungkan Claude Code",
        use: "3. Mulai bekerja",
      },
      label: "Nama token",
      labelHint: "Mis. nama komputer, agar mudah dikenali di daftar.",
      defaultLabel: "Claude Code",
      ttl: "Berlaku",
      ttlOption: (days: number) => `${days} hari`,
      create: "Buat token",
      created: "Token dibuat. Salin sekarang: token tidak akan ditampilkan lagi.",
      tokenOnce: "Token hanya tampil sekali. Simpan di perintah di bawah, bukan di repo.",
      copyToken: "Salin token",
      warning:
        "Token memberi akses ke plan ini saja: membaca isi plan, mengubah status card (Todo → Dikerjakan → Review), dan menulis catatan. Token tidak bisa menandai Selesai, membuat, atau menghapus task.",
      commandIntro:
        "Jalankan di folder repo proyek Anda. Konfigurasi tersimpan di Claude Code pengguna ini, bukan di repo.",
      copyCommand: "Salin perintah",
      mcpJsonSummary: "Alternatif: .mcp.json di repo (token dari variabel lingkungan)",
      mcpJsonIntro:
        "Aman di-commit karena token dibaca dari PIARD_TOKEN. Jangan pernah menulis token langsung di .mcp.json.",
      copyMcpJson: "Salin .mcp.json",
      copyExport: "Salin export",
      remote:
        "Piard ini tidak berjalan di localhost. Server MCP hanya mengirim token lewat https://, dan jalur server MCP di atas berasal dari mesin Piard: sesuaikan dengan salinan repo Piard di komputer Anda.",
      use: 'Di Claude Code, ketik /mcp__piard__work_next_card, atau minta "kerjakan card berikutnya dari Piard". Agen berhenti setelah melapor satu card.',
      instructions: {
        title: "Instruksi proyek untuk agen",
        hint: "Disertakan di setiap task: perintah tes/lint, konvensi, folder yang tidak boleh disentuh.",
        placeholder:
          "Mis. Jalankan pnpm test dan pnpm lint sebelum melapor. Jangan ubah folder migrations/.",
        save: "Simpan instruksi",
        saved: "Instruksi disimpan.",
      },
      tokens: {
        title: "Token plan ini",
        empty: "Belum ada token.",
        created: (at: string) => `Dibuat ${at}`,
        lastUsed: (at: string | null) =>
          at ? `Terakhir dipakai ${at}` : "Belum pernah dipakai",
        expires: (at: string) => `Berlaku sampai ${at}`,
        revoked: "Dicabut",
        expired: "Kedaluwarsa",
        active: "Aktif",
        revoke: "Cabut",
        revokeLabel: (label: string) => `Cabut token ${label}`,
        revokedToast: "Token dicabut.",
        revokeAll: "Cabut semua",
        revokeAllTitle: "Cabut semua token plan ini?",
        revokeAllBody:
          "Agen yang memakai token ini langsung ditolak. Card yang sedang dikerjakan tetap di kolomnya; lepas lewat detail card bila perlu.",
        revokeAllConfirm: "Cabut semua",
        revokeAllCancel: "Batal",
        revokedAll: (n: number) => `${n} token dicabut.`,
      },
    },
  },
} as const;
