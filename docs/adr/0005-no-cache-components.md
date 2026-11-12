# 0005 — Cache Components dimatikan

**Status:** diterima (2026-10-29)

**Konteks.** `create-next-app` 16.4 menyalakan `cacheComponents` dan `partialPrefetching`. Dengan itu
setiap akses `cookies()` harus di dalam `<Suspense>` dan setiap rute divalidasi untuk shell statis.

**Keputusan.** Keduanya dimatikan. Semua halaman area masuk membaca sesi dan data pengguna, jadi memang
dinamis; tidak ada konten publik yang diuntungkan prerender.

**Konsekuensi.** Model render klasik (dinamis bila memakai cookies); guard auth sederhana di layout.
Bila nanti ada halaman publik (mis. berbagi plan), pertimbangkan ulang per rute.
