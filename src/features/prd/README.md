# Fitur PRD

Dokumen PRD tujuh bagian yang disusun AI dari ide, jawaban, dan roadmap, lalu bisa diedit dan diunduh
(doc 07 R8, R11). Halaman: `/plans/:id/prd`, dibuka dari tombol "Lanjutkan ke PRD" di langkah roadmap.

**Alur:** `PrdView` memulai job bila belum pernah ada (`POST /api/plan/generate`) → job `prd`
(`server/service.ts` `runJob`) mengalirkan Markdown dari AI ke draf di memori (`server/drafts.ts`) →
klien polling `GET /api/plan/generate?planId=` tiap detik → di akhir teks dirapikan (`cleanPrd`), dicek
(`checkPrdStructure`), dan disimpan sebagai versi berikutnya di tabel `documents`. Keputusan desain:
[ADR 0009](../../../docs/adr/0009-prd-job.md).

**Keadaan:** `idle` → `generating` (`draft`, `job.phase` queued/writing/saving, `job.sections` n/7) →
`ready`, atau `failed` (versi lama tetap ada; versi yang disimpan sesudah kegagalan mengembalikan `ready`).

**API:** `save-document` (edit → versi baru; isi sama tidak menambah versi; `409` selama job),
`documents?planId=[&version=]` (riwayat tanpa isi / satu versi), `documents/restore` (salin versi lama
menjadi terbaru), `export?format=md[&version=]` (`<slug>-PRD.md`, versi lama `-v<n>`).

**UI:** Markdown lewat `react-markdown` + GFM, judul digeser satu tingkat (halaman sudah punya h1);
mermaid dimuat dinamis dan baru digambar setelah teks selesai; diagram tidak valid menampilkan sumbernya.

**Revisi (M5):** job `prd-revise` (`runReviseJob`) menulis ulang PRD terbaru sesuai permintaan
(`ai/revise.prompt.ts`), dimulai oleh tool chat `updatePrd` atau `POST /api/plan/revise` (tanpa
`instructions` = ulangi revisi terakhir). `job.kind` membedakan `generate`/`revise` di `PrdState`. Versi
dari revisi atau edit menandai PRD berubah (`plans.sync_state`); PRD dari roadmap menandainya selaras.
`PrdView` menerima `aside` (panel chat dari fitur revision).

**Mengubah prompt:** `ai/prd.prompt.ts` (dites di `tests/unit/prd-ai.test.ts`), lalu `pnpm eval:prd`
(kasus klinik dari situs acuan; cek 7 bagian, diagram lolos `mermaid.parse`, fitur roadmap, panjang).
