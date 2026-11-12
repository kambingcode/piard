# Fitur revisi (chat PRD dan sinkronisasi)

Chat di samping PRD untuk bertanya atau meminta perubahan, usulan perubahan fitur yang bisa diterima atau
ditolak, dan penanda saat PRD, fitur, dan task tidak lagi sinkron (doc 07 R13, R14). Halaman:
`/plans/:id/prd` (`PrdWorkspace` membungkus `PrdView` dengan panel di kanan, lembar di bawah `xl`).

**Chat:** `POST /api/plan/chat {planId, text}` mengalirkan NDJSON (`user`, `text`, `part`, `done`/`error`);
`GET` mengembalikan riwayat (`plan_messages`). Satu panggilan `streamChat` (`MODEL_CHAT`) dengan dua tool
yang dijalankan server: `updatePrd` memulai job `prd-revise` di fitur PRD (PRD ditulis ulang utuh, dicek,
menjadi versi baru) dan `proposeFeatureChanges` menyimpan usulan `chat` di `sync_proposals`. Model gagal
sebelum menjawab: pesan pengguna dihapus dan dikembalikan ke kotak pesan. [ADR 0011](../../../docs/adr/0011-chat-revisi.md).

**Sinkronisasi** (`plans.sync_state`, dibaca `readSync`): versi PRD baru dari revisi atau edit menandai
`prd.dirty`; "Sesuaikan fitur dengan PRD" (`POST /sync/features`, job `sync-features`) membandingkan PRD
dengan fitur dan menyimpan usulan `prd-to-features` (tanpa perbedaan: PRD selaras). `POST /sync/apply|reject
{proposalId}` memutuskan usulan; perubahan diterapkan lewat `RoadmapService.applyChanges` dan fitur yang
berubah masuk `staleFeatureIds`, yang disusun ulang di halaman task (`POST /sync/tasks`, fitur specs).
`POST /sync/dismiss` = "Abaikan". `GET /sync/status` untuk panel.

**Mengubah prompt:** `ai/chat.prompt.ts` (dites di `tests/unit/revision-ai.test.ts`), lalu `pnpm eval:chat`.
