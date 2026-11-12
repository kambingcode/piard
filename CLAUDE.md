# CLAUDE.md — Piard (app/)

Aplikasi pribadi: ide → PRD, roadmap, spesifikasi, task. Pengguna berbahasa Indonesia; UI dan komentar
dalam Bahasa Indonesia. Rencana, papan kartu, dan bukti riset disimpan lokal di luar repo (`../PLAN.md`, `../TASKS.md`, `../analysis/`).
Next.js di sini **bukan** yang Anda kenal: baca `node_modules/next/dist/docs/` sebelum memakai API Next
(lihat `AGENTS.md`). `cacheComponents` sengaja mati ([ADR 0005](docs/adr/0005-no-cache-components.md)).

## Perintah

```bash
pnpm check      # tipe + lint + batas impor + tes (wajib hijau sebelum selesai)
pnpm check:fast # tipe + lint
pnpm e2e        # Playwright terhadap build produksi (Chrome terpasang)
pnpm db:generate && pnpm db:migrate
pnpm dev        # http://localhost:3000
pnpm mcp        # server MCP stdio (butuh PIARD_URL + PIARD_TOKEN), lihat docs/agent-bridge.md
```

## Aturan layer (ditegakkan alat; detail di docs/architecture.md)

- `route → service → repo → DB`. Route handler ≤ ~30 baris, tanpa logika bisnis.
- Halaman/komponen **tidak** mengimpor `src/server/**`; lewat `features/<f>/index.ts` (klien) atau
  `features/<f>/server.ts` (server). `src/app/api/**` boleh `server/http` saja.
- Akses database hanya di `repo.ts` fitur dan `src/server/**`.
- `process.env` hanya di `src/server/config/env.ts`. Berkas server mengawali `import "server-only"`.
- Semua panggilan LLM lewat `getAi()` (`server/ai`); jangan memanggil SDK langsung. Bekerja dengan
  `LLM_MODE=mock`; kunci OpenRouter diisi pengguna sendiri di `.env`, **jangan pernah** diminta/ditempel.
- Job handler harus idempoten, menyimpan hasil per langkah, dan melanjutkan dari `ctx.job.progress`.

## Konvensi

- TypeScript strict + `noUncheckedIndexedAccess`; tanpa `any`, tanpa `as` sembarangan (komentari bila perlu).
- Berkas `kebab-case`, komponen `PascalCase`; tanpa `export default` kecuali konvensi Next.
- Teks UI di `copy.ts` fitur; komentar menjelaskan *alasan*. Satu kata kerja per aksi ("Buat", "Simpan").
- Desain: hanya token dari `globals.css` (tanpa hex), lihat docs/ui-guidelines.md. Muat skill
  `ui-ux-pro-max` dan `design-taste-frontend` untuk pekerjaan UI.
- Tes untuk perilaku baru; per fitur: README 10–20 baris. Commit Conventional Commits.

## Jangan lakukan

- Jangan membaca/menyimpan kunci API, token sesi, atau email pengguna; jangan mencetaknya ke log.
- Jangan menjalankan `next dev` di bawah Playwright (reload tanpa henti); e2e memakai build produksi.
- Jangan menambah fitur di luar cakupan (pembayaran, berbagi publik) tanpa diminta.
- Jangan mengubah migrasi yang sudah diterapkan; buat migrasi baru.
- Jangan mengandalkan guard layout (`requireUser`) sebagai satu-satunya otorisasi data: layout tidak
  dirender ulang pada navigasi klien. Setiap route handler (`authedRoute`) dan service memverifikasi
  sesi dan kepemilikan sendiri; klien harus mengarahkan ke /sign-in saat API menjawab 401.
- Jangan mem-bypass `pnpm check` dengan menonaktifkan aturan; perbaiki penyebabnya.
