# 0012 — Batas biaya: global, dicek saat job diantrekan dan sebelum tiap panggilan model

**Status:** diterima (2026-10-30)

**Konteks.** R16 (doc 07 bagian 9): biaya tiap run tampil di detail plan, dan bila batas harian/bulanan
terlampaui job baru ditolak dengan pesan jelas. Tabel `usage` sudah mencatat token dan biaya setiap
panggilan sejak M0 ([ADR 0003](0003-openrouter.md)). Satu job bisa memanggil model berkali-kali (build
spesifikasi + task: dua panggilan per fitur), dan chat serta pertanyaan wizard memanggil model di luar job.

**Keputusan.**
- **Batas untuk seluruh aplikasi**, bukan per pengguna: semua pengguna memakai kunci API yang sama, jadi
  yang dilindungi adalah tagihan pemilik kunci. Hari dan bulan mengikuti zona waktu server.
- **Dua titik periksa, satu penjaga** (`src/server/ai/budget.ts`): `JobRunner.enqueue`/`retry` lewat
  dependensi `admit` (pengguna langsung mendapat 429 `BUDGET_EXCEEDED`, bukan job yang gagal di
  antrean), dan klien AI lewat `checkBudget` sebelum setiap panggilan model (menutup chat, pertanyaan
  wizard, dan job panjang yang melewati batas di tengah jalan). `blocksFurtherCalls` menganggap
  `BUDGET_EXCEEDED` sebagai alasan berhenti sehingga build tidak mencoba fitur berikutnya.
- **Job aktif yang sama tetap dikembalikan** tanpa pemeriksaan (klik ganda bukan job baru).
- **Run** = semua panggilan dengan `ref_id` yang sama (id job), atau satu panggilan tanpa job. Dihitung saat
  dibaca (GROUP BY), tanpa tabel baru.
- Batas dibaca dari env (`BUDGET_DAILY_USD`, `BUDGET_MONTHLY_USD`) lewat fungsi, sehingga `/settings`
  (M6-02) bisa menggantinya tanpa mengubah penjaga.

**Konsekuensi.** Panggilan yang sudah berjalan tidak dihentikan, jadi pengeluaran bisa sedikit melewati
batas (paling banyak satu panggilan per proses yang sedang berjalan). Setiap panggilan menjalankan dua
query SUM atas `usage` berdasarkan `created_at`; untuk aplikasi pribadi ini murah, dan indeks
`created_at` bisa ditambahkan bila tabelnya membesar. Mode mock mencatat biaya 0 sehingga batas tidak
pernah tercapai saat pengembangan.
