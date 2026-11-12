# 0004 — Job latar belakang dalam proses

**Status:** diterima (2026-10-24)

**Konteks.** Roadmap, spesifikasi, dan task membutuhkan puluhan detik dan harus bertahan dari restart.

**Keputusan.** Runner satu worker di proses Node, antrean FIFO di tabel `jobs`. Handler idempoten
menyimpan hasil per langkah dan melaporkan `{phase, done, total}`; `recover()` saat boot mengantrekan
ulang job `running` (maks. 3 percobaan, lalu `failed` dengan pesan jelas). Duplikat (jenis + plan +
muatan sama) tidak diantrekan ganda. Klien mengikuti lewat polling atau SSE.

**Konsekuensi.** Tanpa Redis/worker terpisah. Hanya satu job berjalan sekaligus (paralelisme di dalam
handler bila perlu). Tidak cocok untuk serverless; sejalan dengan [ADR 0002](0002-sqlite.md).
