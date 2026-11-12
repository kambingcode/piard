# 0007 — Autentikasi sendiri untuk pengguna tunggal

**Status:** diterima (2026-10-29)

**Konteks.** Satu pemilik, email + kata sandi, tanpa OAuth. Library auth penuh terlalu besar untuk ini.

**Keputusan.** Kata sandi di-hash scrypt (N=16384, r=8, p=1, garam acak, parameter disimpan di hash,
dinormalisasi NFKC). Sesi: token acak 32 byte di cookie `HttpOnly; SameSite=Lax` (`Secure` di balik
HTTPS/proxy), tabel hanya menyimpan hash SHA-256-nya, masa berlaku `SESSION_TTL_DAYS`. Pendaftaran hanya
sukses bila belum ada pengguna (dicek dan disisipkan dalam satu transaksi). Pesan masuk sama untuk email
tak dikenal dan kata sandi salah, dengan hash tiruan agar waktunya tidak membocorkan; 5 percobaan gagal
mengunci email 15 menit (di memori). CSRF dicegah `SameSite=Lax` (POST lintas situs tidak membawa cookie).

**Konsekuensi.** Tanpa dependensi auth. Batasan: penghitung percobaan hilang saat restart; siapa pun bisa mengunci login pemilik 15 menit dengan 5 percobaan gagal (pilihan sadar: lebih aman daripada tanpa batas untuk aplikasi pribadi); tidak ada
reset kata sandi lewat email (lihat runbook). Perlu ditinjau ulang bila pernah multi-pengguna.
