# Fitur plans

Plan = satu ide yang disusun bertahap lewat wizard `/plans/:id?step=N`. Pemilik tunggal; semua query
memfilter `userId` (plan orang lain dijawab 404, bukan 403).

**Alur:** `/plan` (landing) → `/plan?flow=new` (form ide) → `POST /api/plan/create` → wizard:
1 Ide (baca saja) · 2 Teknologi · 3 Pertanyaan (fitur `questions`) · 4 Struktur (placeholder sampai M2).
`plan.step` = langkah terjauh yang dicapai; URL di luar rentang dialihkan ke langkah itu. Isian
tersimpan otomatis (debounce 800 ms, `lib/autosave.ts`) dan bertahan setelah muat ulang.

**Data:** `workspaces` (satu bawaan "Pribadi" per pengguna), `plans` (JSON: `tech_stack`, `extras`,
`question_answers`, `sync_state`). `techStack` bernilai `"ai-pilih"` bila diserahkan ke AI.

**Endpoint:** `POST /api/plan/create` → `{plan}` · `GET /api/plan/list` → `{plans}` ·
`GET /api/plan/:id` → `{plan, attachments, chatMessages, documents}` · `PATCH /api/plan/:id` → `{ok}`
(parsial: `techStack`, `extras`, `questionAnswers.answers`, `step`, `title`; field asing seperti
`experience`/`budget` diabaikan) · `DELETE /api/plan/:id` → `{ok}`.

**UI:** `IdeaForm`, `WizardShell` (penanda langkah), `TechPrefsStep`, `HistoryList` (sidebar, per hari),
`PlanList` (`/plans`). Hapus memakai Undo 8 detik; state "tersembunyi" dibagi lewat `lib/hidden-set.ts`.

**Pintu:** `index.ts` (skema, tipe, komponen) · `server.ts` (`getPlansService`). Fitur lain memakai
`getPlansService().saveQuestions(...)` untuk menulis pertanyaan.

**Mengubah teks/pilihan:** `copy.ts`, `tech-options.ts`. Kontrak dengan situs asli dijaga
`tests/contract/api-samples.test.ts` dan `tests/integration/plans-api.test.ts`.
