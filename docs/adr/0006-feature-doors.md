# 0006 — Dua pintu fitur dan pengecualian route handler

**Status:** diterima (2026-10-29)

**Konteks.** Doc 09 menetapkan `index.ts` sebagai satu-satunya pintu fitur dan melarang `src/app`
mengimpor `server/**`. Tetapi route handler memerlukan service (server-only) dan helper `server/http`,
sementara komponen klien yang mengimpor `index.ts` akan ikut menarik kode server bila service diekspor di situ.

**Keputusan.** Tiap fitur punya `index.ts` (aman klien) dan `server.ts` (`server-only`). Route handler
boleh mengimpor `server/http` (helper route) selain `server.ts` fitur; selebihnya `server/**` tertutup bagi
`src/app`. `instrumentation.ts` adalah composition root yang menyerahkan job handler fitur ke infrastruktur.

**Konsekuensi.** Batas klien/server tertangkap saat build dan oleh dependency-cruiser. Aturannya ada di
`.dependency-cruiser.cjs` dan docs/architecture.md.
