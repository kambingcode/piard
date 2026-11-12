## Apa itu Piard
Piard adalah aplikasi pribadi yang mengubah satu paragraf ide menjadi PRD, roadmap fitur, spesifikasi, dan task siap tempel untuk AI coding agent. Setiap akun dimiliki oleh satu pengguna.

## Untuk siapa
Aplikasi ini ditujukan untuk pemilik aplikasi yang ingin merencanakan produk baru atau proyek yang sudah ada secara terstruktur. Pendaftaran hanya terbuka untuk akun pertama, jadi aplikasi ini belum dirancang sebagai layanan multi-pengguna.

## Fitur utama
- **Wizard ide**: alur dari ide, preferensi teknologi, lima pertanyaan klarifikasi, roadmap, PRD, hingga spesifikasi dan task.
- **Roadmap**: fitur per fase beserta sub-fitur, ditampilkan sebagai graf atau daftar.
- **PRD**: dokumen Markdown bernomor versi, dengan edit dan pratinjau, perbandingan antarversi, pemulihan versi lama, serta unduhan berkas .md.
- **Spesifikasi dan task**: dibuat per fitur, dengan prompt siap tempel dan papan kanban untuk memantau status.
- **Chat revisi**: dapat merevisi PRD dan mengusulkan perubahan fitur. Setiap usulan dapat diterima atau ditolak.
- **Analisis proyek eksisting**: sumber berasal dari ZIP, URL GitHub, atau agen lokal. Hasilnya berupa dokumentasi berversi.
- **Ekspor**: PRD dalam format Markdown, atau paket ZIP yang berisi PRD dan satu berkas per fitur.
- **Pemakaian AI dan batas biaya**: token dan biaya tercatat per run, dan batas harian serta bulanan dapat membatasi panggilan AI baru.

## Status kematangan
Repo sudah cukup matang untuk pengembangan aktif. Tersedia tes unit, integrasi, kontrak, dan E2E Playwright, evaluasi keluaran AI dengan model nyata, dokumentasi API, serta 16 ADR. Mode mock tersedia untuk pengembangan dan pengujian.

Belum jelas dari bahan yang tersedia: status rilis, nomor versi, dan kewajiban mana yang sudah atau belum terpenuhi. Hal ini perlu dikonfirmasi ke pemilik proyek sebelum aplikasi dianggap siap dipakai.