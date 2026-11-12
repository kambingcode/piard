# 0001 — Stack

**Status:** diterima (2026-10-24)

**Konteks.** Aplikasi pribadi satu pengguna yang menghasilkan dokumen dengan AI; harus mudah dirawat
sendirian dan oleh sesi Claude berikutnya.

**Keputusan.** Next.js (App Router) + TypeScript strict, Tailwind v4 + Radix/shadcn-style, Drizzle +
SQLite, Zod, Vercel AI SDK. pnpm, Biome (lint+format), Vitest, Playwright, dependency-cruiser.

**Konsekuensi.** Satu bahasa dari UI sampai server; skema Zod menjadi sumber tunggal validasi, tipe, dan
kontrak API. Biaya: Next.js versi ini punya konvensi baru (baca dokumen bawaannya), dan aplikasi butuh
proses Node yang hidup (bukan serverless).
