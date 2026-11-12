/** Teks UI fitur usage. */
export const usageCopy = {
  title: "Pemakaian AI",
  meta: (calls: number) => `${calls} panggilan model`,
  totals: {
    cost: "Biaya plan ini",
    input: "Token masuk",
    output: "Token keluar",
  },
  budget: {
    heading: "Batas biaya",
    daily: "Hari ini",
    monthly: "Bulan ini",
    of: (spent: string, limit: string) => `${spent} dari ${limit}`,
    unlimited: (spent: string) => `${spent} · tanpa batas`,
    reached: "Batas tercapai: job AI baru ditolak.",
    note: "Batas berlaku untuk semua plan karena memakai kunci API yang sama.",
    change: "Ubah batas",
  },
  runs: {
    heading: "Riwayat run",
    calls: (n: number) => `${n} panggilan`,
    tokens: (input: string, output: string) => `${input} masuk · ${output} keluar`,
    truncated: (shown: number) =>
      `Menampilkan ${shown} run terbaru; total di atas menghitung semuanya.`,
  },
  empty: {
    title: "Belum ada pemakaian AI",
    body: "Biaya tercatat setiap kali AI menyusun pertanyaan, roadmap, PRD, spesifikasi, task, atau membalas chat revisi.",
  },
  tasks: {
    questions: "Pertanyaan wizard",
    roadmap: "Roadmap",
    prd: "PRD",
    spec: "Spesifikasi",
    tasks: "Task",
    chat: "Revisi",
    codebase: "Analisis proyek",
  },
} as const;
