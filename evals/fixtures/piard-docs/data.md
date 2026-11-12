Halaman ini merangkum tabel, relasi, dan tipe data utama Piard. Skema SQLite didefinisikan dengan Drizzle ORM di `src/server/db/schema.ts`, dan berkas migrasi SQL berada di folder `drizzle/`. Catatan repo menyebut migrasi 0000 sampai 0003, tetapi isi SQL tiap migrasi belum dibaca.

## Hierarki kepemilikan

- `users` memiliki `sessions` dan `workspaces`.
- `workspaces` memiliki `plans`. Workspace bawaan bernama Pribadi dibuat saat pertama kali dibutuhkan.
- `plans` memiliki `features`, `tasks`, `documents`, `attachments`, `plan_messages`, `sync_proposals`, dan `jobs`.
- `usage` mencatat pemakaian model per panggilan. Kolom `plan_id` menjadi NULL jika plan dihapus.
- Setiap data dibatasi oleh `userId`. Data milik pengguna lain diperlakukan seolah tidak ada.

## Tabel utama

| Tabel | Fungsi | Kolom penting |
|---|---|---|
| `users` | Akun pemilik | `email` (unik) |
| `sessions` | Sesi login | `id` berupa SHA-256 dari token, `expiresAt` |
| `workspaces` | Pengelompokan plan per pengguna | `user_id`, `name` |
| `plans` | Ide dan hasil wizard | `idea`, `language`, `title`, `tech_stack` (JSON), `extras`, `question_answers` (JSON), `step` (1 sampai 4), `status` (draft, ready), `sync_state` (JSON), `codebase_id`, `prd_summary` |
| `features` | Roadmap fitur dan sub-fitur | `parent_id`, `phase`, `position`, `status` (planned, in-progress, done), `source` (ai, user), `is_draft` |
| `tasks` | Task dengan prompt siap tempel | `feature_id`, `title`, `description`, `prompt`, `status` (todo, doing, done), `position` |
| `documents` | Riwayat versi PRD | `title` (tetap), `version` |
| `plan_messages` | Chat per plan | `role`, `parts` |
| `sync_proposals` | Usulan perubahan fitur | `scope` (chat, prd-to-features), `ops`, `status` (pending, accepted, rejected) |
| `attachments` | Berkas terkait plan | terhapus saat plan dihapus |
| `jobs` | Antrean job dengan progres | `kind`, `state` (queued, running, succeeded, failed, cancelled), `payload`, `progress`, `attempts`, `error` |
| `usage` | Token dan biaya per panggilan | `kind`, `ref_id` (id job), `model`, `input_tokens`, `output_tokens`, `cost_usd` |
| `app_settings` | Pengaturan AI yang menimpa `.env` | pasangan key-value, kunci `ai`, nilai JSON, `updated_at` |
| `codebases` | Proyek eksisting | `source` (agent, zip, github), `language` (id, en), `status`, `detected_stack`, `manifest`, `analysis_job_id` |
| `codebase_docs` | Halaman dokumentasi berversi | `slug`, `version`, `origin` (ai, agent, manual), `title`, `content` |
| `codebase_doc_proposals` | Usulan dokumentasi | satu baris per codebase dan slug, `base_version` |
| `agent_tokens` | Token agen lokal | `token_hash` (unik), `expires_at` (masa berlaku 24 jam), `revoked_at`, penghitung jendela pemakaian |

Nama kolom di SQL memakai snake_case, sedangkan properti di TypeScript memakai camelCase.

## Relasi dan penghapusan

- `features.parent_id` merujuk ke `features` itu sendiri. Sub-fitur adalah baris dengan `parent_id` terisi.
- Menghapus plan menghapus cascade ke `features`, `tasks`, `documents`, `plan_messages`, dan `jobs`.
- Menghapus feature menghapus task terkait.
- `plans.codebase_id` bersifat opsional dengan `ON DELETE SET NULL`. Menghapus codebase tidak menghapus plan.
- Menghapus codebase menghapus `codebase_docs` dan `agent_tokens` yang terkait.
- Menghapus user menghapus `sessions`.
- `sync_proposals.plan_id` mengacu ke `plans`. Pemeriksaan kepemilikan dilakukan dengan menggabungkan ke `plans` dan memeriksa `userId`.

## Indeks dan kunci unik

- `users.email` unik.
- `documents` unik per `(plan_id, title, version)`. Versi berikutnya dihitung dalam transaksi yang sama dengan penyisipan.
- `codebase_docs` unik per `(codebase_id, slug, version)`.
- `codebase_doc_proposals` unik per `(codebase_id, slug)`.
- `agent_tokens.token_hash` unik. Token mentah tidak disimpan.
- `jobs` memiliki indeks `(state, created_at)` dan `(plan_id, kind)`.

## Kolom JSON

Kolom berikut disimpan sebagai teks JSON: `plans.tech_stack`, `plans.extras`, `plans.question_answers`, `plans.sync_state`, `jobs.payload`, `jobs.progress`, dan `sync_proposals.ops`. Tipe TypeScript yang terkait meliputi `Plan`, `PlanDetail`, `PrdDocument`, `PrdVersion`, `PrdState`, `QuestionAnswers`, `TechStack`, `SyncState`, `CodebaseManifest`, `DetectedStack`, dan `AiSettingsOverrides` (yang terakhir ada di `src/server/db/json-types`).

Skema keluaran AI memakai Zod di `src/features/questions/ai/questions.schema.ts`, `src/features/roadmap/ai/roadmap.schema.ts`, `src/features/specs/ai/build.schema.ts`, `src/features/revision/ai/changes.schema.ts`, dan `src/features/codebase/ai/analyze.schema.ts`.

## Status yang dipakai

- Plan: draft, ready.
- Feature: planned, in-progress, done.
- Task: todo, doing, done.
- Job: queued, running, succeeded, failed, cancelled.
- Codebase: awaiting_source, source_ready, analyzing, ready, failed.
- Roadmap: idle, generating, ready, failed.
- Build spesifikasi: idle, generating, partial, ready, failed.
- Usulan perubahan hanya bisa diubah statusnya selama masih pending, sehingga tidak diterapkan dua kali.

## Yang belum jelas

- Catatan repo tidak konsisten soal codebase. Sebagian menyebut `codebases` sebagai tabel, sebagian menyebut codebase disimpan sebagai berkas JSON per id di folder sementara. Periksa `src/server/db/schema.ts` untuk memastikan.
- Tipe data SQL dan nilai default tiap kolom belum tercatat lengkap.
- Kolom detail tabel `attachments` belum diketahui.
- Isi migrasi 0000 sampai 0003 belum dibaca, sehingga urutan perubahan skema belum dapat dipastikan.