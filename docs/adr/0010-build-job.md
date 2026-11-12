# 0010 — Spesifikasi & task: job per fitur yang bisa dilanjutkan, SSE, format dirakit kode

**Status:** diterima (2026-10-29)

**Konteks.** Situs acuan menyusun spesifikasi dan task semua fitur dalam satu job dengan progres
`n/total` lewat SSE (`/api/plan/generation/stream`, event `job`). Model saat ini gratis dan lambat
(Nemotron: 30-180 detik per panggilan), jadi satu plan bisa makan beberapa menit dan rawan gagal di
tengah. Model gratis juga tidak konsisten: prompt task kadang 20 kata, kadang 250.

**Keputusan.**
- Satu job `build` per plan; per fitur dua panggilan berurutan (spesifikasi `MODEL_SPEC`, task
  `MODEL_TASKS` dengan spesifikasi sebagai konteks), **paling banyak 3 fitur bersamaan**.
- **Simpan per langkah dan lanjutkan, bukan ulang dari awal:** spesifikasi disimpan begitu jadi, task
  menyusul. Fitur "lengkap" bila spesifikasi fitur dan semua sub-fiturnya terisi dan punya task. Job
  selalu hanya mengerjakan yang belum lengkap, sehingga restart, kegagalan sebagian, dan fitur baru
  ditangani jalur yang sama. Fitur yang gagal tidak menghentikan yang lain; job gagal di akhir dengan
  ringkasan, dan "Lanjutkan" mengulang yang gagal saja.
- **SSE** untuk progres (berbeda dari polling roadmap/PRD, [ADR 0008](0008-roadmap-job.md)): event dari
  job runner diteruskan ke klien; event pertama saat tersambung adalah keadaan job terakhir. Klien memuat
  ulang fitur dan task setiap `doneFeatures` naik. Hook `useEventSource` bertipe di `src/lib`.
- **Model mengisi kolom, kode merakit format:** spesifikasi `{goal, needs[]}` → Markdown
  `### Tujuan`/`### Yang dibutuhkan`; task `{title, description, steps[], done[]}` → prompt siap tempel
  dengan produk, fitur, teknologi, dan spesifikasi. Hasilnya selalu berdiri sendiri apa pun modelnya.
- Tanpa TanStack Query (doc 09 menyebutnya): satu halaman, satu sumber event; muat ulang eksplisit
  cukup dan konsisten dengan fitur lain.

**Konsekuensi.** Job runner menjalankan satu job sekaligus untuk semua plan; build yang lama menunda
job plan lain (aplikasi pribadi, diterima). Membuat ulang roadmap menghapus fitur beserta spesifikasi
dan task-nya (kunci asing); halaman lalu menampilkan fitur baru sebagai belum lengkap.
