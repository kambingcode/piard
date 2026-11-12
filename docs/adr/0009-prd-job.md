# 0009 — PRD: job dengan draf di memori, Markdown biasa, versi hanya dari teks utuh

**Status:** diterima (2026-10-29)

**Konteks.** Situs acuan membuat PRD lewat `POST /api/plan/generate` yang langsung mengalirkan respons.
Model PRD saat ini gratis dan lambat (Nemotron: 27-42 detik berpikir sebelum teks pertama, total ±40-90
detik). Aliran HTTP langsung akan putus bila tab ditutup atau dimuat ulang, dan hasil yang sudah ditunggu
lama hilang. PRD juga harus memuat dua diagram mermaid yang valid.

**Keputusan.**
- PRD dibuat oleh **job** `prd` (job runner yang sama dengan roadmap, [ADR 0004](0004-job-in-process.md)).
  `POST /api/plan/generate` mengembalikan `{status}`; klien mengikuti lewat polling `GET` (1 detik). Nama
  endpoint tetap, bentuk responsnya berbeda dari situs acuan.
- Teks yang sedang ditulis disimpan sebagai **draf di memori** (`globalThis`, per plan), bukan di
  database: menulis puluhan kali per detik ke SQLite tidak perlu, dan job yang terputus diulang dari
  awal (satu aliran LLM tidak bisa dilanjutkan).
- Keluaran AI berupa **Markdown biasa**, bukan objek terstruktur, agar langsung bisa ditampilkan dan
  tidak bergantung pada dukungan structured output model gratis. Bentuknya dijaga di akhir:
  `cleanPrd` merapikan kebiasaan model (teks pembuka, pembungkus, pagar ganda), `checkPrdStructure`
  mewajibkan judul, tujuh bagian bernomor, `sequenceDiagram`, dan `erDiagram`.
- Hanya teks yang lolos cek yang menjadi **versi** di `documents`; buat ulang, edit, dan pulihkan selalu
  menambah versi (riwayat tidak pernah dihapus). Edit ditolak `409` selama job berjalan.
- Validitas sintaks mermaid tidak memblokir penyimpanan: viewer menampilkan sumber untuk diagram yang
  gagal, dan `pnpm eval:prd` memeriksanya dengan `mermaid.parse`.

**Konsekuensi.** Draf hilang bila proses mati di tengah job; job dipulihkan saat boot dan menulis ulang
dari awal. PRD tidak ikut berubah saat roadmap dibuat ulang; sinkronisasi PRD ↔ fitur dikerjakan di M5.
