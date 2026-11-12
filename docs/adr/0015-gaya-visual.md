# 0015 — Gaya visual: netral dan tenang ala Sana, token tunggal, aksen hemat

**Status:** diterima (2026-10-29, ditulis 2026-10-30)

**Konteks.** Situs acuan terasa padat dan generik. Pengguna memilih arah visual Sana:
permukaan netral, tipografi tenang, satu aksi utama per layar.
Aplikasi dipakai lama (membaca PRD, menyusun task), di tema terang dan gelap.

**Keputusan.**
- **Token di satu tempat** (`src/styles/globals.css`, `light-dark()` dideklarasikan pada `:root,
  [data-theme]`); komponen hanya memakai kelas token, tidak pernah hex. Kontras AA kedua tema dijaga
  `tests/unit/design-tokens.test.ts`.
- **Pil hitam** sebagai aksi utama; tombol sekunder bergaris; aksen indigo `--accent` hanya untuk fokus,
  tautan, dan progres. Aksen bertentangan dengan selera skill desain (tanpa violet/indigo); dipakai hemat
  dan bisa diganti di satu variabel (TASKS B-01).
- **Geist** Sans/Mono dari paket (tanpa jaringan saat build); judul halaman ≤ 32px; angka kolom `.tabular`.
- **Pola bersama** (`src/components/patterns`): `StepList`, `EmptyState`, `ConfirmUndo`, `StreamingText`,
  `ConfirmDialog`, dengan galeri di `/dev/components`.
- Detail aturan layar: [docs/ui-guidelines.md](../ui-guidelines.md).

**Konsekuensi.** Tampilan tidak menyalin situs acuan maupun Sana (tanpa aset, logo, atau teks mereka). Fitur
baru wajib memakai pola dan token yang ada; warna status selalu disertai teks atau ikon.
