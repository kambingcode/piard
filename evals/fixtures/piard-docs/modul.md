## Routing dan lapisan HTTP
- Tanggung jawab: halaman dan route handler Next.js yang tipis. Route hanya mem-parse permintaan, memeriksa autentikasi, lalu memanggil service fitur.
- Berkas kunci: `src/app/api/**/route.ts` (route tipis), `src/server/http/route.ts` (pembangun route: autentikasi, validasi Zod untuk params, query, dan body, pemetaan galat, header no-store), `src/server/http/body.ts` (pembacaan badan dengan batas byte), `src/server/http/errors.ts`, `src/server/http/sse.ts`, `src/server/http/ndjson.ts`.
- Halaman area masuk: `src/app/(app)/layout.tsx` (memanggil requireUser lalu memuat daftar plan), `src/app/(app)/plan/page.tsx`, `src/app/(app)/plans/page.tsx`, `src/app/(app)/settings/page.tsx`. Halaman galat: `src/app/error.tsx`, `src/app/not-found.tsx`. Beranda `src/app/page.tsx` hanya mengalihkan ke /plan.
- Dependensi: memakai `authedRoute` dari `src/features/auth/server` atau `publicRoute` dari `src/server/http/route.ts`, lalu memanggil service fitur.

## Autentikasi
- Tanggung jawab: pendaftaran pengguna pertama saja, masuk, sesi bertoken hash, keluar, dan pembatasan percobaan gagal di memori.
- Berkas kunci: `src/features/auth/server/service.ts`, `session.ts` (authenticateRequest, authedRoute, getCurrentUser, requireUser), `flows.ts` (alur HTTP), `cookie.ts` (cookie piard_session), `password.ts` (hash scrypt), `repo.ts` (satu-satunya penyentuh tabel users dan sessions).
- Pintu fitur: `src/features/auth/index.ts` (klien) dan `src/features/auth/server.ts` (server-only).
- UI: `src/features/auth/components/` (sign-in-form, sign-up-form, use-auth-form, password-field, auth-card, sign-out-button). Halaman tipis di `src/app/(auth)/sign-in/page.tsx` dan `src/app/(auth)/sign-up/page.tsx`; `src/app/(auth)/layout.tsx` mengalihkan sesi aktif ke /plan.
- Dependensi: dipakai oleh seluruh route terautentikasi dan layout area masuk.

## Plans (ide dan wizard)
- Tanggung jawab: wizard ide, pengelolaan plan (buat, ubah, hapus), jawaban klarifikasi, dan status sinkronisasi. Service tidak mengenal HTTP.
- Berkas kunci: `src/features/plans/server/service.ts`, `src/features/plans/server/repo.ts` (satu-satunya penyentuh tabel plans dan workspaces), `src/features/plans/server/instance.ts`, `src/features/plans/server/plan-jobs.ts` (pembatalan job plan), `src/features/plans/schemas.ts`, `src/features/plans/wizard.ts`, `src/features/plans/title.ts`, `src/features/plans/sync.ts` (membaca status sinkronisasi dari plans.sync_state), `src/features/plans/prompt-context.ts`, `src/features/plans/tech-options.ts`.
- Komponen: `src/features/plans/components/` berisi wizard-shell.tsx, tech-prefs-step.tsx, idea-form.tsx, idea-step.tsx, plan-landing.tsx, history-list.tsx, plan-list.tsx, plan-nav.tsx, command-palette.tsx, palette-commands.ts, use-autosave.ts, use-plan-deletion.ts (hapus dengan Undo), cancel-job-button.tsx.
- Dependensi: memakai modul lib (autosave, undoable) dan Drizzle. Modul prd, roadmap, dan revision bergantung pada data plan.

## Questions (klarifikasi)
- Tanggung jawab: lima pertanyaan klarifikasi yang dihasilkan AI untuk setiap ide. Pembuatan bersifat idempoten dan mendeduplikasi permintaan yang sedang berjalan per pengguna, plan, dan mode.
- Berkas kunci: `src/features/questions/ai/questions.schema.ts`, `questions.prompt.ts` (fungsi murni), `questions.mock.ts` (fixture deterministik untuk id dan en), `src/features/questions/server/service.ts`, `src/features/questions/server/instance.ts`, `src/features/questions/answers.ts` (dilewati, terjawab, lainnya, pilihan ganda).
- Komponen: `src/features/questions/components/question-step.tsx`, `generate-questions.tsx`.
- Dependensi: memakai `src/server/ai` untuk panggilan model dan dipanggil dari wizard plans.

## Roadmap
- Tanggung jawab: roadmap fitur per fase dengan sub-fitur, dihasilkan sebagai job AI bertahap, lalu diedit dan diurutkan.
- Berkas kunci: `src/features/roadmap/ai/roadmap.schema.ts`, `roadmap.prompt.ts`, `roadmap.mock.ts`, `roadmap.normalize.ts`, `src/features/roadmap/server/service.ts`, `src/features/roadmap/server/instance.ts` (jeda mock 350 ms, pendaftaran handler job), `src/features/roadmap/schemas.ts`, `layout.ts` (tata letak graf), `icons.ts`, `progress.ts`.
- Komponen: `src/features/roadmap/components/` berisi roadmap-step.tsx, roadmap-graph.tsx (React Flow, hanya layar lebar), roadmap-list.tsx, roadmap-nodes.tsx, feature-panel.tsx, use-roadmap.ts, regenerate-dialog.tsx, roadmap-progress.tsx, feature-icon.tsx.
- Dependensi: memakai runner job di `src/server/jobs`, `src/server/ai`, dan data plan. Hasilnya dipakai modul prd dan specs.

## PRD
- Tanggung jawab: pembuatan PRD Markdown bertahap, versi, edit manual, pemulihan versi, riwayat, dan ekspor Markdown bernama slug-PRD.md.
- Berkas kunci: `src/features/prd/ai/prd.prompt.ts` (tujuh bagian, aturan mermaid), `revise.prompt.ts` (menulis ulang PRD utuh), `prd.mock.ts`, `src/features/prd/server/service.ts` (job prd dan prd-revise), `repo.ts` (tabel documents untuk versi), `drafts.ts` (draf di memori pada globalThis), `instance.ts`, `src/features/prd/structure.ts` (pemeriksaan kelengkapan dan diagram), `schemas.ts`, `progress.ts`.
- Komponen: `src/features/prd/components/` berisi prd-view.tsx, prd-editor.tsx, prd-diff.tsx, prd-markdown.tsx, mermaid-diagram.tsx, prd-progress.tsx, use-prd.ts (polling), use-prd-versions.ts.
- Dependensi: memakai `src/lib/line-diff.ts` untuk perbandingan versi dan runner job. Modul revision memakai service PRD.

## Specs dan tasks
- Tanggung jawab: spesifikasi per fitur, task dengan prompt siap tempel, CRUD task, status massal, reset, dan papan kanban.
- Berkas kunci spesifikasi: `src/features/specs/ai/build.schema.ts`, `build.prompt.ts`, `build.mock.ts`, `src/features/specs/server/service.ts`, `src/features/specs/server.ts`, `spec-markdown.ts` (merakit spesifikasi), `task-prompt.ts` (merakit prompt siap tempel), `progress.ts`, `schemas.ts` (konkurensi 3 fitur).
- Berkas kunci task: `src/features/tasks/server/service.ts`, `src/features/tasks/server.ts`, `src/features/tasks/copy.ts`, `src/features/tasks/components/kanban-board.tsx`.
- Komponen spesifikasi: `src/features/specs/components/build-progress.tsx`.
- Dependensi: spesifikasi dibangun dari roadmap dan PRD; task disesuaikan oleh modul revision.

## Revision (chat revisi)
- Tanggung jawab: chat revisi yang dapat menulis ulang PRD, mengusulkan perubahan fitur (terima, tolak, abaikan), dan menjalankan job sinkronisasi sync-features.
- Berkas kunci: `src/features/revision/ai/changes.schema.ts` (termasuk normalizeChanges yang membuang perubahan tidak sah), `chat.prompt.ts`, `chat.mock.ts`, `reconcile.mock.ts`, `src/features/revision/schemas.ts`, `src/features/revision/server/service.ts`, `repo.ts` (tabel plan_messages dan sync_proposals), `instance.ts` (handler job reconcile).
- Komponen: `src/features/revision/components/` berisi revision-panel.tsx, chat-message.tsx, proposal-card.tsx, sync-notice.tsx, prd-workspace.tsx, use-revision.ts.
- Dependensi: memakai service PRD, roadmap, specs, dan tasks untuk penyesuaian lintas modul.

## Codebase (proyek eksisting)
- Tanggung jawab: analisis proyek dari ZIP atau GitHub, pemindaian, dokumentasi, dan jalur agen lokal dengan token sekali tampil.
- Berkas kunci server: `src/features/codebase/server/service.ts`, `agent.ts` (token pcb_, hash SHA-256, batas laju), `analyze.ts` (job codebase-analyze, perkiraan biaya, konfirmasi di atas US$0,50 atau 20% sisa anggaran), `github.ts` (unduhan arsip, hanya host yang diizinkan), `source-store.ts` (penyimpanan sementara 0700 dan 0600, TTL 24 jam), `instance.ts`, `repo.ts`.
- Berkas kunci lain: `src/features/codebase/scan/` (unzip.ts, scan-repo.ts, redact.ts, rules.ts, pack.ts, paths.ts, stack.ts), `src/features/codebase/ai/` (analyze.prompt.ts, analyze.plan.ts, analyze.mock.ts, analyze.schema.ts), `agent-prompt.ts`, `github-url.ts`, `markdown-import.ts`, `limits.ts`, `schemas.ts`, `src/features/codebase/server.ts`.
- Dependensi: memakai runner job, `src/server/ai`, pengaturan, dan anggaran biaya.

## Export
- Tanggung jawab: membangun paket ekspor berupa PRD.md dan features/NN-slug.md, serta ZIP dengan fflate.
- Berkas kunci: `src/features/export/bundle.ts`, `schemas.ts` (format md atau zip, versi opsional), `index.ts`, `server.ts`, `src/features/export/server/service.ts`, `instance.ts`.
- Dependensi: membaca data plan, PRD, roadmap, dan tasks.

## Usage dan settings
- Usage: `src/features/usage/server.ts` (service dan repo), `schemas.ts` (MAX_RUNS), `format.ts` (format USD). Mengelompokkan pemakaian AI per job dan per plan.
- Settings: `src/features/settings/schemas.ts`, `server/service.ts`, `server/instance.ts`. Hanya nilai yang berbeda dari env yang disimpan sebagai override. Penyimpanan di `src/server/settings/store.ts` (tabel app_settings), dengan `effectiveAiSettings` yang menimpa env.

## Server bersama
- `src/server/ai`: klien (client.ts) dengan mode mock dan openrouter, budget.ts (batas biaya), providers.ts, usage.ts (token dan biaya), errors.ts. ID berawalan claude- lewat Anthropic, lainnya lewat OpenRouter.
- `src/server/jobs`: runner in-process satu worker dengan antrean FIFO di tabel jobs (runner.ts, repo.ts, types.ts). Dibatasi 3 percobaan dan dipulihkan saat boot.
- `src/server/config/env.ts`: validasi env dan konfigurasi LLM per tugas.
- `src/server/boot.ts`: validasi env, migrasi, pekerjaan awal, lalu menyalakan job runner. `src/instrumentation.ts` menyambungkan handler job dan membersihkan sumber codebase lama.
- `src/server/logger.ts`: menyaring kunci rahasia.
- Dependensi: semua fitur bergantung pada modul ini; modul ini tidak boleh mengimpor fitur.

## Skema database
- Berkas kunci: `src/server/db/schema.ts` (tabel SQLite Drizzle, tipe JSON dari `./json-types`), `src/server/db/client.ts`, `src/server/db/workspaces.ts`, `drizzle/` (migrasi 0000 sampai 0003).

## Komponen UI dan pembantu
- `src/components/layout/` (app-shell.tsx, nav.ts yang hanya memuat /plan dan /settings, palette-event.ts).
- `src/components/patterns/` (confirm-dialog, confirm-undo dengan toast Undo 8 detik, copy-button, empty-state, step-list, streaming-text, pattern-gallery).
- `src/components/ui/` (button, choice, input, label, select, textarea, toaster, tooltip).
- `src/lib/` (api-client.ts, api-error.ts, ai-models.ts, autosave.ts, undoable.ts, draft-storage.ts, hidden-set.ts, line-diff.ts, ndjson.ts, use-event-source.ts, eta.ts, steps.ts, day-groups.ts, slug.ts, cn.ts). Fungsi di sini murni atau hook klien.
- `src/styles/globals.css`: token warna terang dan gelap.

## Tes dan evaluasi
- Tes berada di `tests/unit`, `tests/integration`, `tests/contract`, dan `tests/e2e` (Playwright). `vitest.config.mts` hanya memindai tiga folder pertama.
- `tests/unit/architecture.test.ts` menegakkan aturan arsitektur dengan memindai berkas di src.
- `evals/` berisi evaluasi keluaran AI dengan model nyata (`*.eval.ts` dan `*-checks.ts`). Pemeriksaan murni di `evals/*-checks.ts` juga diimpor oleh tes unit.

## Dokumentasi dan skrip
- `docs/adr/0001` sampai `0016`, `docs/architecture.md`, `docs/api.md` (dibuat otomatis oleh `scripts/api-docs.ts`), `docs/runbook.md`, `docs/ai-pipeline.md`, `docs/ui-guidelines.md`.
- Skrip: `scripts/db-migrate.ts`, `scripts/db-seed.ts`, `scripts/llm-check.ts`, `scripts/gen-api-docs.ts`.

## Yang belum jelas
- Isi berkas di luar potongan pembacaan (misalnya rincian `src/features/tasks/components/kanban-board.tsx` dan `src/features/usage/format.ts`) belum diperiksa, sehingga tanggung jawab detailnya hanya berdasarkan nama dan catatan.
- Hubungan antarmodul secara rinci (misalnya urutan pemanggilan sync-features) hanya diketahui dari nama berkas dan tes, bukan dari kode lengkap.