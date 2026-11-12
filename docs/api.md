# API Piard

<!-- Dibuat otomatis oleh `pnpm docs:api` dari route handler dan skema Zod. Jangan disunting manual. -->

93 endpoint di `src/app/api`. Semua menerima dan mengembalikan JSON kecuali disebut lain
(NDJSON, SSE, unduhan). Sesi berupa cookie `piard_session` dari `POST /api/auth/sign-in`; tanpa sesi
yang sah, endpoint "Butuh sesi" menjawab 401. Respons sukses tanpa isi berstatus 204.

Galat selalu berbentuk `{ error: string; code: string; issues?: { path: string; message: string }[] }`.
`error` aman ditampilkan ke pengguna; `issues` ada pada `VALIDATION` (per kolom).

| Kode | Status |
|---|---|
| `NOT_FOUND` | 404 |
| `VALIDATION` | 400 |
| `UNAUTHORIZED` | 401 |
| `BUDGET_EXCEEDED` | 429 |
| `UPSTREAM_AI` | 502 |
| `CONFLICT` | 409 |
| `INTERNAL` | 500 |

## agent

### `GET /api/agent/documents/prd`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. PRD terbaru → `{prd: {version, content, truncated} | null}` (maks. 60.000 karakter).

### `GET /api/agent/plan`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. Ringkasan plan untuk agen → `{plan, progress, features, instructions, you}`. `you.holding` = task `doing` yang sedang dipegang token ini.

### `GET /api/agent/tasks`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. Daftar task plan (tanpa prompt penuh), opsional per status/fitur → `{tasks}`.

Query:

```ts
{
  status?: "todo" | "doing" | "review" | "done";
  featureId?: string; // 1-64 karakter
}
```

### `GET /api/agent/tasks/:id`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. Detail task → `{task}`: prompt, fitur + spesifikasi, bagian PRD terkait, catatan, instruksi proyek.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/agent/tasks/:id/claim`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. Klaim task `todo → doing` (atomik; idempoten untuk token yang sama) → `{task}`. 409 bila task bukan Todo, dipegang agen lain, atau token masih memegang task lain.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/agent/tasks/:id/notes`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. Catatan atau pertanyaan (`kind: note|question`) pada task yang sedang dipegang → `{note}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  kind?: "note" | "question"; // bawaan "note"
  body: string; // 1-4000 karakter
}
```

### `POST /api/agent/tasks/:id/release`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. Melepas task yang dipegang `doing → todo` dengan alasan → `{task}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  reason: string; // 3-4000 karakter
}
```

### `POST /api/agent/tasks/:id/report`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. Lapor task selesai dikerjakan `doing → review` (idempoten) → `{task}`. Badan `{summary, verification, filesChanged?}`; hanya pengguna yang memindahkan ke Selesai.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  summary: string; // 10-4000 karakter
  verification: string; // 5-2000 karakter
  filesChanged?: string[]; // maks 100 item; bawaan []
}
```

### `GET /api/agent/tasks/next`

Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi. Task berikutnya → `{task, alreadyClaimed}`: task `doing` yang masih dipegang token ini bila ada, selain itu task `todo` pertama menurut urutan roadmap; `task: null` bila tidak ada lagi.

## auth

### `GET /api/auth/me`

Butuh sesi. Pengguna sesi ini → `{user}`.

### `POST /api/auth/sign-in`

Tanpa sesi. Masuk → `{user}` dan cookie sesi. Email/kata sandi salah dan terlalu banyak percobaan gagal sama-sama 401 dengan pesan yang sama.

Isi JSON:

```ts
{
  email: string;
  password: string; // 1-200 karakter
}
```

### `POST /api/auth/sign-out`

Tanpa sesi. Keluar: sesi dihapus dan cookie dikosongkan → 204. Tanpa sesi pun berhasil.

### `POST /api/auth/sign-up`

Tanpa sesi. Membuat akun pemilik (hanya akun pertama) dan langsung masuk.

Isi JSON:

```ts
{
  name: string; // 1-80 karakter
  email: string;
  password: string; // 8-200 karakter
}
```

### `GET /api/auth/status`

Tanpa sesi. Dipakai halaman masuk untuk tahu apakah tautan "Buat akun" masih relevan.

## codebase

### `GET /api/codebase/:id`

Butuh sesi. Detail proyek eksisting → `{codebase}` (manifes tanpa daftar berkas).

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `PATCH /api/codebase/:id`

Butuh sesi. Mengganti nama proyek → `{codebase}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  name: string; // 1-120 karakter
}
```

### `DELETE /api/codebase/:id`

Butuh sesi. Menghapus proyek beserta dokumentasi dan token agennya; plan tertaut tetap ada → `{ok: true, keptPlans}` (jumlah plan yang kini tanpa tautan proyek).

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `GET /api/codebase/:id/agent-token`

Butuh sesi. Status token agen tanpa tokennya → `{active, expiresAt, lastUsedAt}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/codebase/:id/agent-token`

Butuh sesi. Token agen baru (`pcb_…`, berlaku 24 jam, token lama dicabut) → `{token, expiresAt}`. Token mentah hanya ada di respons ini; server menyimpan hash-nya saja.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `DELETE /api/codebase/:id/agent-token`

Butuh sesi. Mencabut token agen yang aktif → `{revoked}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/codebase/:id/analyze`

Butuh sesi. Memulai analisis server (job `codebase-analyze`) → `{started: true, codebase}`, atau `{started: false, estimate}` bila perkiraan biaya butuh konfirmasi dan `confirmed` belum true.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  confirmed?: boolean; // bawaan false
}
```

### `POST /api/codebase/:id/analyze/cancel`

Butuh sesi. "Batalkan": menghentikan analisis dan menghapus sumber sementara → `{codebase}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/codebase/:id/analyze/retry`

Butuh sesi. "Coba lagi" analisis yang gagal; langkah yang sudah selesai tidak diulang → `{codebase}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `GET /api/codebase/:id/docs`

Butuh sesi. Tanpa `slug`: `{pages}` (versi terbaru tiap halaman, tanpa isi). Dengan `slug`: `{page, versions, proposal}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Query:

```ts
{
  slug?: "ringkasan" | "teknologi" | "struktur-folder" | "arsitektur" | "modul" | "data" | "api" | "alur-utama" | "menjalankan" | "catatan";
  version?: number; // ≥ 1
}
```

### `POST /api/codebase/:id/docs`

Butuh sesi. Edit manual satu halaman → versi baru `origin = manual` → `{page, versions, proposal}` (409 saat analisis).

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  slug: "ringkasan" | "teknologi" | "struktur-folder" | "arsitektur" | "modul" | "data" | "api" | "alur-utama" | "menjalankan" | "catatan";
  content: string; // 1-40000 karakter
}
```

### `POST /api/codebase/:id/docs/proposal`

Butuh sesi. Terima (`accept`: menjadi versi baru) atau tolak (`reject`) usulan analisis ulang → `{page, versions, proposal}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  slug: "ringkasan" | "teknologi" | "struktur-folder" | "arsitektur" | "modul" | "data" | "api" | "alur-utama" | "menjalankan" | "catatan";
  action: "accept" | "reject";
}
```

### `POST /api/codebase/:id/docs/restore`

Butuh sesi. Memulihkan versi lama (disalin menjadi versi terbaru `origin = manual`) → `{page, versions, proposal}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  slug: "ringkasan" | "teknologi" | "struktur-folder" | "arsitektur" | "modul" | "data" | "api" | "alur-utama" | "menjalankan" | "catatan";
  version: number; // ≥ 1
}
```

### `GET /api/codebase/:id/estimate`

Butuh sesi. Perkiraan token dan biaya analisis dari sumber yang tersimpan → `{estimate}` (`costUsd` null bila harga model belum diketahui; `needsConfirmation` + `reasons` bila melewati ambang).

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `GET /api/codebase/:id/export`

Butuh sesi. Unduh seluruh dokumentasi: `<slug-nama>-docs.zip` berisi `NN-<slug>.md` per halaman.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/codebase/:id/github`

Butuh sesi. Sumber dari URL repo GitHub (`{url, token?}`) → `{codebase}` berstatus `source_ready`. Hanya `api.github.com`/`codeload.github.com` yang dihubungi; `token` tidak disimpan dan tidak dicatat.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  url: string; // 1-500 karakter
  token?: string; // maks 255 karakter; pola ^[A-Za-z0-9_]*$
}
```

### `POST /api/codebase/:id/import-markdown`

Butuh sesi. Jalur cadangan agen: hasil Markdown bersekat `<!-- piard:page <slug> -->` ditempel pengguna → `{codebaseId, added, redactions, fixes}`. Disimpan sebagai versi `origin = agent`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  markdown: string; // 1-410000 karakter
}
```

### `GET /api/codebase/:id/status`

Butuh sesi. Status analisis → `{status, error, job: {id, state, phase, done, total} | null}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `GET /api/codebase/:id/stream`

Butuh sesi. SSE event `status` (bentuk sama dengan `GET .../status`): segera saat tersambung, lalu tiap perubahan.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/codebase/:id/upload`

Butuh sesi. Upload ZIP proyek (badan = byte arsip mentah, bukan multipart; nama berkas di header `x-file-name`, di-encode URI) → `{codebase}` berstatus `source_ready`. Batas dari `CODEBASE_MAX_UPLOAD_MB` (413).

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/codebase/agent/submit`

Tanpa sesi. Kiriman dokumentasi dari agen lokal (ADR 0016). Otorisasi `Authorization: Bearer pcb_…` (bukan cookie), diperiksa sebelum badan dibaca; badan JSON `{pages: [{slug, content}], detectedStack?}` maks. 1 MB → `{codebaseId, added, redactions}`. Token salah/kedaluwarsa/dicabut dijawab 401 seragam.

### `POST /api/codebase/create`

Butuh sesi. Membuat proyek eksisting (tanpa sumber). Sumber kode dikirim terpisah sesuai jalurnya.

Isi JSON:

```ts
{
  name: string; // 1-120 karakter
  source: "agent" | "zip" | "github";
  language?: "id" | "en"; // bawaan "id"
}
```

### `GET /api/codebase/list`

Butuh sesi. Proyek eksisting milik pengguna, yang terakhir diubah paling atas.

## health

### `GET /api/health`

Tanpa sesi. Pemeriksaan hidup: dipakai e2e dan monitor sederhana. Contoh pemakaian helper route.

## plan

### `GET /api/plan/:id`

Butuh sesi. Detail plan → `{plan, attachments, chatMessages, documents}` (bentuk situs acuan).

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `PATCH /api/plan/:id`

Butuh sesi. Mengubah sebagian plan (autosave wizard) → `{ok: true}`. Field tak dikenal diabaikan.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  techStack?: {
    backend?: string; // 1-120 karakter
    database?: string; // 1-120 karakter
    frontend?: string; // 1-120 karakter
    deployment?: string; // 1-120 karakter
  };
  extras?: string[]; // maks 30 item
  questionAnswers?: {
    answers: Record<string, string | string[]>;
  };
  step?: number; // ≥ 1; ≤ 4
  title?: string; // 1-120 karakter
  agentInstructions?: string | null; // maks 8000 karakter
}
```

### `DELETE /api/plan/:id`

Butuh sesi. Menghapus plan beserta fitur, task, dokumen, dan job-nya → `{ok: true}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `GET /api/plan/agent-board`

Butuh sesi. Keadaan agen per card kanban → `{cards: {[taskId]: {tokenLabel, claimedAt, lastAgentAt, openQuestion, notes}}}`.

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `GET /api/plan/agent-tokens`

Butuh sesi. Token agen plan tanpa nilainya → `{tokens}` (terbaru dulu, termasuk yang dicabut/kedaluwarsa).

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `POST /api/plan/agent-tokens`

Butuh sesi. Token agen baru `{planId, label, ttlDays: 7|30|90}` → `{token, agentToken}`. Token mentah (`ppl_…`) hanya ada di respons ini; maks. 5 token aktif per plan.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  label: string; // 1-60 karakter
  ttlDays?: 7 | 30 | 90; // bawaan 30
}
```

### `GET /api/plan/chat`

Butuh sesi. Riwayat chat revisi plan → `{messages}`.

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `POST /api/plan/chat`

Butuh sesi. Mengirim pesan → aliran NDJSON `user`, `text`, `part`, lalu `done` atau `error`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  text: string; // 1-4000 karakter
}
```

### `POST /api/plan/create`

Butuh sesi. Membuat plan dari ide. Klien lanjut ke `/plans/:id?step=2`.

Isi JSON:

```ts
{
  idea: string; // 1-6000 karakter
  language?: "id" | "en"; // bawaan "id"
  codebaseId?: string; // 1-64 karakter
}
```

### `GET /api/plan/documents`

Butuh sesi. Tanpa `version`: `{versions}` (riwayat tanpa isi). Dengan `version`: `{document}`.

Query:

```ts
{
  planId: string; // 1-64 karakter
  version?: number; // ≥ 1
}
```

### `GET /api/plan/export`

Butuh sesi. Unduh: `?planId=&format=md[&version=n]` → `<slug>-PRD.md` (versi lama `-v<n>`); `format=zip` → `<slug>.zip` berisi `PRD.md` dan `features/NN-<slug>.md`.

Query:

```ts
{
  planId: string; // 1-64 karakter
  format?: "md" | "zip"; // bawaan "md"
  version?: number; // ≥ 1
}
```

### `GET /api/plan/generate`

Butuh sesi. Polling keadaan PRD: `{status, document, draft, job}`.

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `POST /api/plan/generate`

Butuh sesi. Memulai job PRD → `{status}`; idempoten kecuali `regenerate` (versi baru).

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  regenerate?: boolean; // bawaan false
}
```

### `GET /api/plan/list`

Butuh sesi. Plan milik pengguna, yang terakhir diubah paling atas.

### `POST /api/plan/questions`

Butuh sesi. Membuat 5 pertanyaan klarifikasi dengan AI (idempoten kecuali `regenerate`).

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  regenerate?: boolean; // bawaan false
}
```

### `POST /api/plan/revise`

Butuh sesi. Memulai revisi PRD → `{status, fromVersion, jobId}`; tanpa `instructions` mengulang revisi terakhir.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  instructions?: string; // maks 4000 karakter
}
```

### `POST /api/plan/save-document`

Butuh sesi. Menyimpan hasil edit PRD → `{document}` (versi baru, kecuali isinya sama dengan versi terbaru).

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  content: string; // maks 100000 karakter
}
```

## plan/agent-tokens

### `DELETE /api/plan/agent-tokens/:id`

Butuh sesi. Mencabut satu token agen → `{agentToken}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/plan/agent-tokens/revoke-all`

Butuh sesi. Mencabut semua token agen plan `{planId}` → `{revoked}`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
}
```

## plan/documents

### `POST /api/plan/documents/restore`

Butuh sesi. Memulihkan versi lama sebagai versi terbaru → `{document}`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  version: number; // ≥ 1
}
```

## plan/features

### `PATCH /api/plan/features/:id`

Butuh sesi. Mengubah fitur roadmap → `{feature}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  name?: string; // 1-80 karakter
  summary?: string; // maks 400 karakter
  phase?: number; // ≥ 1; ≤ 10
  status?: "planned" | "in-progress" | "done";
}
```

### `DELETE /api/plan/features/:id`

Butuh sesi. Menghapus fitur beserta sub-fitur dan task-nya → `{ok: true}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/plan/features/create`

Butuh sesi. Fitur tambahan dari pengguna (`source: "user"`), ditaruh di akhir daftar.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  name: string; // 1-80 karakter
  summary?: string; // maks 400 karakter; bawaan ""
  phase?: number; // ≥ 1; ≤ 10
}
```

### `GET /api/plan/features/list`

Butuh sesi. Fitur utama plan urut posisi → `{features}`.

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

## plan/generation

### `POST /api/plan/generation/start`

Butuh sesi. Memulai job spesifikasi & task → `{status}`; tanpa `regenerate` hanya fitur yang belum lengkap.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  regenerate?: boolean; // bawaan false
}
```

### `GET /api/plan/generation/status`

Butuh sesi. Keadaan spesifikasi & task: `{status, totalFeatures, doneFeatures, incompleteFeatureIds, job}`.

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `GET /api/plan/generation/stream`

Butuh sesi. SSE event `job` (`phase`, `status`, `totalFeatures`, `doneFeatures`) untuk job plan.

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

## plan/jobs

### `POST /api/plan/jobs/cancel`

Butuh sesi. Membatalkan job AI yang sedang berjalan atau antre untuk plan → `{cancelled}` (jumlah job).

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
}
```

## plan/roadmap

### `GET /api/plan/roadmap/generate`

Butuh sesi. Polling keadaan roadmap: `{status, title, features, subFeatures, job}`.

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `POST /api/plan/roadmap/generate`

Butuh sesi. Memulai job roadmap → `{status}`; idempoten kecuali `regenerate`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  regenerate?: boolean; // bawaan false
}
```

## plan/subfeatures

### `PATCH /api/plan/subfeatures/:id`

Butuh sesi. Mengubah sub-fitur → `{subFeature}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  name?: string; // 1-80 karakter
  summary?: string; // maks 400 karakter
  status?: "planned" | "in-progress" | "done";
}
```

### `DELETE /api/plan/subfeatures/:id`

Butuh sesi. Menghapus sub-fitur beserta task-nya → `{ok: true}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/plan/subfeatures/create`

Butuh sesi. Menambah sub-fitur di bawah fitur → `{subFeature}`.

Isi JSON:

```ts
{
  featureId: string; // 1-64 karakter
  name: string; // 1-80 karakter
  summary?: string; // maks 400 karakter; bawaan ""
}
```

### `GET /api/plan/subfeatures/list`

Butuh sesi. Sub-fitur plan (opsional satu fitur) → `{subFeatures}`; `featureId` = `parentId`.

Query:

```ts
{
  planId: string; // 1-64 karakter
  featureId?: string; // 1-64 karakter
}
```

## plan/sync

### `POST /api/plan/sync/apply`

Butuh sesi. Menerima usulan → `{proposal, changed, sync}`; perubahan diterapkan ke roadmap.

Isi JSON:

```ts
{
  proposalId: string; // 1-64 karakter
}
```

### `POST /api/plan/sync/dismiss`

Butuh sesi. "Abaikan": PRD dianggap selaras dengan fitur tanpa perubahan → `SyncStatus`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `POST /api/plan/sync/features`

Butuh sesi. "Sesuaikan fitur dengan PRD": memulai job pembanding → `SyncStatus`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `POST /api/plan/sync/reject`

Butuh sesi. Menolak usulan → `{proposal, sync}`; roadmap tidak berubah.

Isi JSON:

```ts
{
  proposalId: string; // 1-64 karakter
}
```

### `GET /api/plan/sync/status`

Butuh sesi. Keadaan sinkronisasi PRD ↔ fitur ↔ task → `SyncStatus`.

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `POST /api/plan/sync/tasks`

Butuh sesi. "Sesuaikan task": menyusun ulang spesifikasi & task fitur yang berubah → `{status}`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
}
```

## plan/tasks

### `PATCH /api/plan/tasks/:id`

Butuh sesi. Mengubah task (judul, deskripsi, prompt, status, posisi) → `{task}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  title?: string; // 1-160 karakter
  description?: string; // maks 4000 karakter
  prompt?: string; // maks 20000 karakter
  status?: "todo" | "doing" | "review" | "done";
}
```

### `DELETE /api/plan/tasks/:id`

Butuh sesi. Menghapus task → `{ok: true}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `GET /api/plan/tasks/:id/notes`

Butuh sesi. Linimasa card (laporan dan pertanyaan agen, catatan pengguna, peristiwa) → `{notes}`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/plan/tasks/:id/notes`

Butuh sesi. Catatan atau jawaban pengguna `{body}` → `{note}`; dibaca agen lewat `get_task`.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  body: string; // 1-4000 karakter
}
```

### `POST /api/plan/tasks/:id/release`

Butuh sesi. Mengambil kembali card Dikerjakan milik agen ke Todo → `{task}`. 409 bila bukan card agen.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

### `POST /api/plan/tasks/:id/review`

Butuh sesi. Tinjau card Review → `{task}`: `{decision: "approve"}` (ke Selesai) atau `{decision: "changes", note}` (ke Todo dengan catatan untuk agen). 409 bila card sudah tidak di Review.

Parameter alamat:

```ts
{
  id: string; // 1-64 karakter
}
```

Isi JSON:

```ts
{
  decision: "approve";
} | {
  decision: "changes";
  note: string; // 3-4000 karakter
}
```

### `PATCH /api/plan/tasks/bulk-status`

Butuh sesi. Mengubah status banyak task sekaligus → `{updated}`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
  ids: string[]; // min 1 item; maks 500 item
  status: "todo" | "doing" | "review" | "done";
}
```

### `POST /api/plan/tasks/create`

Butuh sesi. Task buatan pengguna di akhir daftar fiturnya → `{task}`.

Isi JSON:

```ts
{
  featureId: string; // 1-64 karakter
  title: string; // 1-160 karakter
  description?: string; // maks 4000 karakter; bawaan ""
  prompt?: string; // maks 20000 karakter; bawaan ""
}
```

### `POST /api/plan/tasks/generate`

Butuh sesi. Menyusun ulang task satu fitur → `{status}`.

Isi JSON:

```ts
{
  featureId: string; // 1-64 karakter
}
```

### `GET /api/plan/tasks/list`

Butuh sesi. `{tasks}` satu plan, opsional satu fitur; urut fitur lalu posisi.

Query:

```ts
{
  planId: string; // 1-64 karakter
  featureId?: string; // 1-64 karakter
}
```

### `POST /api/plan/tasks/reset`

Butuh sesi. Semua task plan kembali ke "todo" → `{updated}`.

Isi JSON:

```ts
{
  planId: string; // 1-64 karakter
}
```

### `GET /api/plan/tasks/stream`

Butuh sesi. SSE event `task`: task plan berubah oleh job (klien memuat ulang daftar task). Event `agent`: card berubah oleh agen atau tinjauan (M8-11; `{taskId, status, reason}`).

Query:

```ts
{
  planId: string; // 1-64 karakter
}
```

## settings

### `GET /api/settings`

Butuh sesi. Pengaturan AI yang berlaku → `SettingsView`.

### `PUT /api/settings`

Butuh sesi. Menyimpan model per tugas dan batas biaya → `SettingsView`.

Isi JSON:

```ts
{
  models: {
    questions: string; // 1-200 karakter; pola ^[A-Za-z0-9][\w.\-:/]*$
    roadmap: string; // 1-200 karakter; pola ^[A-Za-z0-9][\w.\-:/]*$
    prd: string; // 1-200 karakter; pola ^[A-Za-z0-9][\w.\-:/]*$
    spec: string; // 1-200 karakter; pola ^[A-Za-z0-9][\w.\-:/]*$
    tasks: string; // 1-200 karakter; pola ^[A-Za-z0-9][\w.\-:/]*$
    chat: string; // 1-200 karakter; pola ^[A-Za-z0-9][\w.\-:/]*$
    codebase: string; // 1-200 karakter; pola ^[A-Za-z0-9][\w.\-:/]*$
  };
  budget: {
    dailyUsd: number | null; // > 0; ≤ 100000
    monthlyUsd: number | null; // > 0; ≤ 100000
  };
}
```

### `DELETE /api/settings`

Butuh sesi. Menghapus pengaturan tersimpan sehingga `.env` berlaku lagi → `SettingsView`.
