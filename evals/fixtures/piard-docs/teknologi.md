## Bahasa dan runtime

- **TypeScript** adalah bahasa utama untuk kode aplikasi, server, skrip, dan tes.
- **JavaScript** dipakai untuk pengaturan tooling, misalnya `scripts/ignore-css.cjs` dan `scripts/stub-server-only.cjs`.
- **SQL** dipakai untuk berkas migrasi di folder `drizzle/`.
- **Node.js** menjalankan server dan skrip CLI. Inisialisasi runtime hanya berjalan untuk runtime `nodejs`.
- **pnpm** adalah pengelola paket. Konfigurasi workspace ada di `pnpm-workspace.yaml`.

## Framework dan UI

- **Next.js** dipakai untuk halaman, layout, dan route handler di `src/app`. Route handler juga dipakai sebagai backend.
- **Tailwind CSS** dipakai untuk styling. Token warna terang dan gelap ada di `src/styles/globals.css`.
- Font **Geist** dipasang di root layout.
- **React Flow** dipakai untuk graf roadmap di layar lebar. Impor CSS-nya diakali lewat `scripts/ignore-css.cjs` saat skrip CLI berjalan.
- **Mermaid** dipakai untuk diagram di PRD. Parsing mermaid untuk evaluasi ada di `evals/mermaid-node.ts`.
- **fflate** dipakai untuk membuat paket ZIP ekspor.

## Database

- **SQLite** adalah database tunggal. Berkas bawaannya ada di `data/piard.db` dan mode WAL dipakai.
- **Drizzle ORM** dipakai untuk definisi tabel di `src/server/db/schema.ts` dan migrasi di `drizzle/`.
- Drizzle Kit dipakai lewat `drizzle.config.ts`.

## Layanan eksternal

- **OpenRouter** adalah penyedia LLM utama. Model dengan awalan claude- diarahkan ke API **Anthropic**.
- **GitHub** (api.github.com dan codeload.github.com) dipakai untuk mengunduh arsip repo pada analisis proyek eksisting. Token GitHub pribadi dikirim per permintaan dan tidak disimpan.
- Mode `mock` menggantikan semua panggilan LLM dengan fixture deterministik. Mode ini tidak membutuhkan jaringan atau kunci.

## AI dan validasi

- **Vercel AI SDK** dipakai di lapisan klien AI bersama.
- **Zod** dipakai untuk skema validasi env, body, query, params, dan keluaran AI.

## Alat build, lint, dan tes

- **Biome** dipakai untuk lint dan format.
- **Vitest** dipakai untuk tes unit, integrasi, dan kontrak. Tes berada di `tests/unit`, `tests/integration`, dan `tests/contract`.
- **Playwright** dipakai untuk tes E2E terhadap build produksi dengan Chrome. Pemeriksaan aksesibilitas memakai axe.
- **dependency-cruiser** menegakkan aturan batas impor lewat `.dependency-cruiser.cjs` dan skrip `pnpm deps`.
- **TypeScript** dipakai untuk pemeriksaan tipe lewat `tsconfig.json`.

## Keamanan dan kriptografi

- Hash kata sandi memakai **scrypt** dari modul bawaan Node.js.
- Token sesi dan token agen disimpan sebagai hash **SHA-256**.

## Versi penting

- Potongan catatan tidak memuat nomor versi paket. Versi pasti Next.js, Drizzle, Vitest, Playwright, dan lainnya perlu dilihat langsung di `package.json`.
- Versi Node.js yang disyaratkan juga belum jelas dari catatan.

## Yang belum jelas

- Isi `package.json` tidak termuat, sehingga versi dan daftar dependensi lengkap belum dapat dipastikan.
- Konfigurasi Vercel AI SDK dan penyedia spesifiknya belum terlihat secara rinci.