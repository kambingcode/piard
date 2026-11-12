# Fitur codebase (proyek eksisting)

Kode yang sudah ada dimasukkan (prompt untuk agen lokal Claude Code, upload ZIP, atau URL GitHub publik),
dianalisis menjadi dokumentasi 10 halaman standar yang bisa diedit dan berversi, lalu dipakai sebagai
konteks untuk merencanakan fitur baru. Rancangan dan model ancaman: [ADR 0016](../../../docs/adr/0016-proyek-eksisting.md).

**Data:** `codebases` (status `awaiting_source` → `source_ready` → `analyzing` → `ready` | `failed`),
`codebase_docs` (satu baris per versi halaman, `origin` agent/ai/manual), `agent_tokens` (hash saja).
`plans.codebase_id` menaut plan fitur baru (`SET NULL` saat proyek dihapus). Workspace bawaan dibuat lewat
`server/db/workspaces.ts` agar fitur ini tidak bergantung pada `plans`.

**Halaman standar:** `DOC_PAGES` di `schemas.ts` (slug, judul id/en, urutan). Judul selalu dari server.

**API:** `POST /api/codebase/create` → `{codebase}` · `GET /api/codebase/list` → `{codebases}` ·
`GET|PATCH|DELETE /api/codebase/:id` (`PATCH` hanya `name`) · `GET /api/codebase/:id/docs` → `{pages}`,
`?slug=` → `{page, versions}`, `&version=` → versi tertentu. `POST /api/codebase/:id/upload` (byte ZIP
mentah) dan `POST /api/codebase/:id/github` (`{url, token?}`) → `{codebase}` berstatus `source_ready`. Respons memuat ringkasan manifes, bukan
daftar berkas. Semua query memfilter `userId` (milik orang lain = 404).

**Pemindai (`scan/`, fungsi murni):** `normalizeEntryPath` (tolak `..`/absolut/NUL), `skipReasonForPath`
(dependensi, build, lockfile, biner, kunci privat), `redactSecrets` (env per baris + pola token; sengaja
condong menyensor lebih banyak), `detectStack` (manifes + berkas penanda, tanpa model), `scanRepo`
(lepas pembungkus, saring, sensor, maks. 5.000 berkas, manifes), `packFiles` (potongan sesuai anggaran
token, berkas kunci dulu). Batas di `limits.ts`.

**Agen (`server/agent.ts`):** `POST|GET|DELETE /api/codebase/:id/agent-token` (sesi; token `pcb_…` tampil
sekali, hash SHA-256 saja, 24 jam, satu aktif) dan `POST /api/codebase/agent/submit` (Bearer, bukan cookie;
badan ≤ 1 MB diperiksa setelah token; 401 seragam; 20 permintaan/10 menit per token di DB). Isi kiriman
disensor seperti isi repo, disimpan sebagai versi `origin = agent`, status menjadi `ready`.

**GitHub (`github-url.ts`, `server/github.ts`):** `parseGithubUrl` murni (dipakai klien juga); unduhan hanya
ke `api.github.com` → pengalihan ke `codeload.github.com` (dicek manual, SSRF), token privat hanya di header
API dan tidak disimpan. Subfolder `/tree/<cabang>/<folder>` diurai saja tanpa sisa repo.

**Analisis (`server/analyze.ts`, `ai/`):** job `codebase-analyze` (profil → ringkas per potongan → 10 halaman),
hasil per langkah di `<id>.work.json` sehingga lanjut setelah restart/"Coba lagi"; `GET …/estimate`,
`POST …/analyze` (`{confirmed}`), `…/analyze/retry`, `…/analyze/cancel`, `GET …/status`, SSE `…/stream`.
Ringkasan hasil (`analysisSummary`: baru/berubah/tetap/usulan, berkas dipotong) disimpan karena sumbernya
dihapus. Halaman yang versi terbarunya `manual` menerima usulan (`codebase_doc_proposals`), tidak ditimpa.

**Pintu:** `index.ts` (skema, tipe, teks, komponen) · `server.ts` (`getCodebaseService`, `getAnalysisService`,
`getAgentService`, `codebaseJobHandlers`). Fitur lain membaca konteks codebase hanya lewat
`getCodebaseService().contextFor(userId, codebaseId)` (format di `context.ts`).

**Tes:** integrasi `codebase-{schema,service,api,upload,github,agent,analyze,docs,plans,progress,security,
boot,source-store,pipeline-context}.test.ts`; unit `codebase-{scan,unzip,github-url,agent-prompt,
analyze-prompt,analysis-steps,context-prompts,eval-checks}.test.ts`; e2e `codebase.{desktop,mobile}.spec.ts`,
`codebase-states.desktop.spec.ts`, axe di `pages.a11y.spec.ts`. Eval: `pnpm eval:codebase`.
