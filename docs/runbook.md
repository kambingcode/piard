# Runbook

## Menjalankan

```bash
pnpm install && cp .env.example .env
pnpm dev                 # pengembangan, http://localhost:3000
pnpm build && pnpm start # produksi lokal (satu proses Node; bukan serverless)
```

Jalankan semua perintah dari folder `app/` (folder `drizzle/` dan `DATABASE_PATH` relatif terhadapnya).
Migrasi diterapkan otomatis saat server mulai. Manual: `pnpm db:migrate`.
Setelah mengubah `src/server/db/schema.ts`: `pnpm db:generate` lalu commit folder `drizzle/`.

## Mengisi kunci OpenRouter

1. Buat kunci di openrouter.ai/keys.
2. Isi **sendiri** `.env` (jangan ditempel di chat, jangan di-commit):
   ```
   LLM_MODE=openrouter
   OPENROUTER_API_KEY=...
   MODEL_QUESTIONS=... MODEL_ROADMAP=... MODEL_PRD=... MODEL_SPEC=... MODEL_TASKS=... MODEL_CHAT=...
   ```
3. Mode `openrouter` mewajibkan **semua** model dan kunci tiap penyedia yang dipakai; server menolak
   mulai bila ada yang kosong. Kembali ke `LLM_MODE=mock` kapan saja untuk bekerja tanpa jaringan dan
   tanpa biaya.

## Memakai kunci Anthropic langsung

Model berawalan `claude-` tanpa garis miring (mis. `MODEL_ROADMAP=claude-haiku-5-5`) dipanggil langsung ke
API Anthropic dengan `ANTHROPIC_API_KEY` (dari console.anthropic.com/settings/keys, diisi sendiri di `.env`).
ID gaya OpenRouter (`anthropic/claude-haiku-5.5`) tetap lewat OpenRouter. Biaya panggilan langsung dihitung
dari token dengan tabel harga di `src/server/ai/usage.ts`; perbarui tabel itu bila harga berubah.

## Mengganti model

Cara cepat: halaman **Pengaturan** (`/settings`), berlaku mulai panggilan AI berikutnya tanpa mulai ulang
dan menimpa `.env` ([ADR 0013](adr/0013-pengaturan.md)); "Pakai nilai .env" mengembalikannya. Cara
permanen: ubah `MODEL_<TUGAS>` di `.env`, lalu mulai ulang server. Tiap tugas (questions, roadmap, prd, spec,
tasks, chat) bisa memakai model berbeda. Biaya per panggilan tercatat di tabel `usage`.
Model default dan hasil uji ada di `docs/ai-pipeline.md`. Setelah mengganti model, jalankan
`pnpm llm:check` (dan `--questions` untuk uji 3 ide), `pnpm eval:roadmap` untuk model roadmap, atau
`pnpm eval:prd` untuk model PRD.

## Batas biaya AI

Batas harian dan bulanan (USD) berlaku untuk seluruh aplikasi. Ubah di halaman **Pengaturan**
(`/settings`, langsung berlaku), atau isi `BUDGET_DAILY_USD` / `BUDGET_MONTHLY_USD` di `.env` (kosong =
tanpa batas, perlu mulai ulang). Nilai di Pengaturan menimpa `.env`. Saat tercapai, job AI baru,
"Coba lagi", chat, dan pertanyaan wizard ditolak dengan `BUDGET_EXCEEDED` (429) yang mengarahkan ke
Pengaturan; atau tunggu hari/bulan berikutnya (zona waktu server). Pemakaian dan status batas terlihat di tab
**Pemakaian** setiap plan (`/plans/:id/usage`). Alasan desain: [ADR 0012](adr/0012-batas-biaya.md).

## Backup database

Seluruh data ada di satu berkas SQLite (`DATABASE_PATH`, bawaan `data/piard.db`) dalam mode WAL.
Backup aman saat server berjalan:

```bash
sqlite3 data/piard.db ".backup 'backup-$(date +%F).db'"
```

Jangan menyalin `piard.db` saja saat server berjalan (ada `-wal` dan `-shm`). Pulihkan dengan
menghentikan server lalu menimpa berkas.

## Akun

Pendaftaran hanya terbuka sampai akun pertama dibuat. Lupa kata sandi: hentikan server dan hapus baris
di tabel `users` (dan `sessions`) lewat `sqlite3`, lalu daftar ulang. Semua plan ikut terhapus
(`ON DELETE CASCADE`), jadi ekspor dulu bila perlu.

## Proyek eksisting (codebase)

Rancangan dan model ancaman: [ADR 0016](adr/0016-proyek-eksisting.md). Hal yang perlu diketahui saat
mengoperasikan:

- **Sumber sementara** (teks tersaring dan tersensor, bukan berkas mentah) ada di
  `<folder database>/tmp/codebase/<id>.json` dan `<id>.work.json` (hasil antara analisis), folder 0700 dan
  berkas 0600. Dihapus saat analisis selesai, dibatalkan, atau proyeknya dihapus; saat gagal disimpan untuk
  "Coba lagi" sampai 24 jam, lalu disapu saat boot. Menghapus semua sisa secara manual aman kapan saja
  (paling buruk analisis yang gagal harus diunggah ulang):

  ```bash
  rm -rf data/tmp/codebase
  ```

- **Mencabut semua token agen** (mis. bila prompt berisi token tersebar): token mentah tidak pernah disimpan,
  jadi cukup tandai semua hash dicabut. Hentikan server atau jalankan saat sepi:

  ```bash
  sqlite3 data/piard.db "UPDATE agent_tokens SET revoked_at = strftime('%s','now')*1000 WHERE revoked_at IS NULL;"
  ```

  Satu proyek saja: tombol "Cabut token" di halaman proyek (`DELETE /api/codebase/:id/agent-token`).
- **Prompt agen menunjuk `localhost`**: agen di mesin lain tidak bisa mengirim hasil. Isi `APP_URL` di `.env`
  dengan alamat Piard yang bisa dijangkau, lalu mulai ulang server.
- **Batas upload**: `CODEBASE_MAX_UPLOAD_MB` (bawaan 50, maks. 500) juga membatasi unduhan GitHub.
- **Analisis "Menganalisis" terus**: status disamakan dengan job saat halaman dibuka; job yang mati setelah
  3 kali restart ditandai gagal dan bisa "Coba lagi".
- **"Mulai analisis" menolak dengan pesan batas biaya**: anggaran harian/bulanan sudah habis (dicek sebelum
  job diantrekan, 429). Naikkan batas di `/settings` atau tunggu periode berikutnya.
- **Uji nyata tanpa menyentuh data dev** (`pnpm build` dulu): `DATABASE_PATH=<folder sementara>/piard.db
  NODE_ENV=production pnpm exec next start -p 3300`, daftar akun lewat `POST /api/auth/sign-up`, lalu
  `create` → `upload`/`github` → `estimate` → `analyze` → `status`. Biaya tercatat di tabel `usage` DB itu.
- **Uji jalur agen dengan Claude Code**: buat token di halaman proyek, salin prompt, lalu di folder akar repo
  jalankan Claude Code interaktif dan tempel prompt (setujui `curl`/`python3` saat diminta). Mode
  non-interaktif (`claude -p`) tidak bisa meminta izin: berikan `--allowedTools` untuk `Write`,
  `Bash(mkdir:*)`, `Bash(python3:*)`, `Bash(curl:*)`, `Bash(rm:*)` dan `--add-dir` untuk folder `TMPDIR`.

## Jembatan agen (MCP)

Rancangan dan model ancaman: [ADR 0017](adr/0017-jembatan-agen.md); pemasangan: [agent-bridge.md](agent-bridge.md).

- **Mencabut semua token agen satu plan**: Kanban → Hubungkan AI → Cabut semua
  (`POST /api/plan/agent-tokens/revoke-all`). Semua plan sekaligus (mis. token tersebar), hanya hash yang
  disimpan jadi cukup tandai dicabut:

  ```bash
  sqlite3 data/piard.db "UPDATE plan_agent_tokens SET revoked_at = strftime('%s','now')*1000 WHERE revoked_at IS NULL;"
  ```

- **Pemantauan**: daftar token di dialog menampilkan "terakhir dipakai"; token yang tidak dikenali →
  cabut. Menghapus plan atau akun menghapus tokennya (cascade).
- **Card tertahan "Dikerjakan"** oleh agen yang sudah berhenti: setelah 2 jam tanpa kabar card bertanda
  "Mungkin macet" dengan tombol Lepas; sebelum itu, pindahkan lewat menu status (klaim agen ikut dilepas).
- **`claude mcp list` tidak `Connected`**: jalankan `PIARD_URL=… PIARD_TOKEN=… node app/mcp/server.ts`
  langsung; pesan galatnya (stderr) menyebut yang salah. Token tidak pernah dicetak.
- **Agen di mesin lain / Piard di-deploy**: isi `APP_URL` (cuplikan memakai alamat itu), pakai `https://`
  (server MCP menolak `http://` selain localhost), dan sesuaikan jalur `mcp/server.ts` dengan salinan repo
  di mesin agen. Batas laju per IP di belakang proksi (`TRUSTED_PROXY`) belum ada (M8-14).
- **Uji nyata tanpa menyentuh data dev**: seperti proyek eksisting di atas (port 3300 + DB sementara),
  lalu `claude mcp add … -- node app/mcp/server.ts` di repo uji dan `claude -p "/mcp__piard__work_next_card"
  --allowedTools "mcp__piard,Read,Edit,Write,Glob,Grep,Bash(npm test:*)"`. Hapus lagi dengan
  `claude mcp remove piard -s local`.

## Pemecahan masalah

- **Server menolak mulai dengan "Konfigurasi env tidak valid"**: pesannya menyebut variabel yang salah.
- **Job tertahan `running`**: restart server; `recover()` mengantrekannya ulang. Setelah 3 kali mati ia
  ditandai gagal dengan pesan jelas.
- **Roadmap "Saldo OpenRouter tidak cukup"**: model mahal (mis. Sonnet) butuh saldo lebih besar untuk
  satu permintaan. Isi saldo di openrouter.ai atau pakai model yang lebih murah di `MODEL_ROADMAP`.
- **Roadmap terlalu lama (> 60 detik)**: model gratis sering lambat dan tidak mengalir; lihat tabel di
  `docs/ai-pipeline.md`.
- **E2E macet di `next dev`**: e2e sengaja memakai build produksi; `next dev` di bawah Playwright memuat
  ulang halaman tanpa henti.
