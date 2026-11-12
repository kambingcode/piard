# 0011 — Chat revisi: tool dijalankan server, revisi PRD sebagai job, NDJSON tanpa `useChat`

**Status:** diterima (2026-10-29)

**Konteks.** Situs acuan memakai `useChat` dari Vercel AI SDK dengan tool `updatePrd` dan
`proposeFeatureChanges`; hasil revisi PRD ikut dialirkan di dalam aliran chat. Model chat default di sini
gratis dan lambat (Nemotron: 30-40 detik berpikir), dan penulisan ulang PRD utuh bisa makan 1-2 menit.
Aliran chat yang putus (tab ditutup) tidak boleh menghilangkan revisi yang sedang ditulis.

**Keputusan.**
- **Satu langkah model per pesan.** Model menulis balasan dan boleh memanggil kedua tool sekaligus; tidak
  ada langkah lanjutan setelah tool (satu panggilan model lambat sudah cukup lama). Kartu tindakan di UI
  menggantikan kalimat penutup model.
- **Tool dijalankan di server** (`defineChatTool` di `server/ai`), bukan di klien: `updatePrd` hanya
  memulai job `prd-revise` (penulisan ulang memakai `MODEL_PRD`, draf, cek struktur, dan versi yang sama
  dengan job PRD, [ADR 0009](0009-prd-job.md)); `proposeFeatureChanges` menyimpan usulan. Panel chat lalu
  menyerahkan pemantauan revisi ke polling PRD yang sudah ada.
- **NDJSON lewat `fetch` POST**, bukan protokol UI message stream dan `@ai-sdk/react`: tidak menambah
  dependensi, bekerja sama dengan mode `mock` (skenario teks + tool), dan event-nya sedikit (`user`,
  `text`, `part`, `done`, `error`). Pesan disimpan sebagai potongan ringkas (`text`, `prd-revision`
  dengan id job, `proposal` dengan id usulan, `notice`); statusnya dibaca ulang saat dimuat.
- **Perubahan fitur berbentuk datar untuk model** (`op`, `featureId?`, `name?`, ...) lalu dinormalkan kode
  menjadi union bertipe dengan keadaan sebelumnya (`before`); id yang tidak dikenal dan perubahan kosong
  dibuang. Usulan diterima atau ditolak utuh (bukan per butir), dalam satu transaksi dengan statusnya.
- **Sinkronisasi** disimpan di `plans.sync_state`: `prd.dirty` (PRD berubah sejak fitur disesuaikan) dan
  `staleFeatureIds` (fitur berubah sejak task dibuat). Hanya usulan `prd-to-features` (atau "Abaikan")
  yang menandai PRD selaras; PRD yang dibuat ulang dari roadmap juga selaras.

**Konsekuensi.** Chat tidak bisa menjawab berdasarkan hasil revisi pada giliran yang sama. Satu balasan per
plan sekaligus (kunci di memori proses). Usulan bisa lebih tua dari roadmap; perubahan untuk fitur yang
sudah tidak ada dilewati saat diterapkan. Menerima usulan tidak mengubah PRD; "Sesuaikan task" menyusun
ulang spesifikasi dan task fitur yang berubah (status task fitur itu kembali ke Todo).
