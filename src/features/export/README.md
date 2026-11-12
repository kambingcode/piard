# Fitur ekspor

Unduh hasil plan (doc 07 R11, struktur doc 04) lewat `GET /api/plan/export?planId=&format=`.

- `format=md` (bawaan): PRD sebagai `<slug>-PRD.md`; `&version=n` untuk versi lama (`-v<n>`).
- `format=zip`: `<slug>.zip` berisi `PRD.md` dan `features/NN-<slug>.md` berurutan sesuai roadmap.
  Isi tiap berkas fitur: `# <nama>`, ringkasan, `## Spesifikasi`, lalu tiap sub-fitur
  `## Sub-fitur: <nama>` + ringkasan + spesifikasi, lalu `## Task` dengan `### n. <judul>`, deskripsi, dan
  `**Prompt:**` dalam blok kode.

**Builder murni:** `bundle.ts` (`featureMarkdown`, `exportFiles`, `zipFiles`), dites di
`tests/unit/export-bundle.test.ts`. Slug dari `src/lib/slug.ts` (huruf kecil, aksen dilepas, maks 60);
slug ganda diberi akhiran `-2`; nomor dua digit (tiga bila 100+ fitur); pagar blok kode prompt selalu
lebih panjang dari backtick di dalam prompt. ZIP dibuat dengan `fflate`.

ZIP butuh PRD (404 bila belum ada). Fitur yang belum punya spesifikasi atau task tetap ikut dengan
bagian kosong. Tombol "Unduh ZIP" ada di halaman spesifikasi & task; "Unduh .md" di halaman PRD.
