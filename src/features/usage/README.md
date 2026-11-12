# Fitur usage

Pemakaian AI per plan (doc 07 R16, bagian 9) di halaman `/plans/:id/usage` (tab "Pemakaian").

- **Run** = satu job (semua panggilan model berbagi `usage.ref_id` = id job, mis. build
  spesifikasi + task) atau satu panggilan di luar job (pertanyaan wizard, chat). Daftar memuat
  `MAX_RUNS` run terbaru; total plan menghitung semuanya.
- **Data:** tabel `usage` ditulis `src/server/ai` di setiap panggilan model (mode mock memperkirakan
  token, biaya 0). Fitur ini hanya membaca (`server/repo.ts`); kepemilikan plan dicek di query.
- **Batas biaya:** dari halaman Pengaturan (fitur `settings`) atau `BUDGET_DAILY_USD` /
  `BUDGET_MONTHLY_USD` di `.env`, berlaku untuk seluruh aplikasi (satu kunci API). Penjaganya
  `src/server/ai/budget.ts`: job baru dan "Coba lagi" ditolak saat diantrekan, dan setiap panggilan
  model dicek lagi, dengan `BUDGET_EXCEEDED` (429) yang mengarahkan ke halaman Pengaturan.
  Hari/bulan mengikuti zona waktu server.
- **Format:** `format.ts` (USD empat desimal di bawah satu sen, angka `id-ID`), dites di
  `tests/unit/usage-format.test.ts`; service di `tests/integration/usage-service.test.ts`.
