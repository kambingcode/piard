# 0002 — SQLite (better-sqlite3 + Drizzle)

**Status:** diterima (2026-10-24)

**Konteks.** Satu pengguna, satu proses, data kecil. Tidak perlu server database terpisah.

**Keputusan.** Satu berkas SQLite (`data/piard.db`, mode WAL, kunci asing aktif) lewat better-sqlite3
(sinkron, cepat) dan Drizzle ORM. Migrasi SQL dihasilkan drizzle-kit dan diterapkan otomatis saat boot.
Waktu disimpan sebagai epoch milidetik; kolom JSON bertipe lewat `$type`. Hash token sesi dipakai sebagai
id sesi, bukan token mentah.

**Konsekuensi.** Backup = menyalin satu berkas (lihat runbook). Transaksi sinkron menyederhanakan
`createFirstUser` dan klaim job. Tidak cocok untuk beberapa instans; itu di luar kebutuhan.
