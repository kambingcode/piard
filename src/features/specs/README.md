# Fitur spesifikasi & task

Tiap fitur roadmap diberi spesifikasi (`### Tujuan`, `### Yang dibutuhkan`) lalu dipecah menjadi task
berurutan dengan prompt siap tempel untuk AI coding agent (doc 07 R9, R10). Halaman: `/plans/:id/tasks`.

**Alur:** `BuildView` memulai job `build` bila belum pernah ada (`POST /api/plan/generation/start`). Job
(`server/service.ts`) membaca PRD terbaru dan fitur, lalu mengerjakan fitur yang belum lengkap, paling
banyak 3 sekaligus. Per fitur ada dua panggilan: spesifikasi (`MODEL_SPEC`, disimpan ke `features.spec`)
lalu task (`MODEL_TASKS`, mengganti task fitur itu). Progres dikirim lewat SSE
`GET /api/plan/generation/stream` (event `job`: `phase`, `status`, `totalFeatures`, `doneFeatures`);
klien memuat ulang fitur dan task tiap kali satu fitur selesai. [ADR 0010](../../../docs/adr/0010-build-job.md).

**Lengkap** = spesifikasi fitur dan semua sub-fiturnya terisi, dan fitur punya task. Job bisa diulang
kapan saja: hanya yang belum lengkap yang dikerjakan (fitur baru di roadmap, fitur yang gagal, restart).
`regenerate` mengosongkan semuanya dulu. `POST /api/plan/tasks/generate {featureId}` menyusun ulang task
satu fitur (job `feature-tasks`, event `task` di `GET /api/plan/tasks/stream`).

**Fitur yang berubah (M5):** usulan perubahan fitur yang diterima menandai fiturnya basi
(`staleFeatureIds` di `BuildState`). "Sesuaikan task" (`POST /api/plan/sync/tasks`, job `sync-tasks`)
menulis ulang spesifikasi dan task fitur itu; fitur dihapus dari daftar basi begitu selesai.

**Format tetap:** model mengisi kolom terstruktur; Markdown spesifikasi (`spec-markdown.ts`) dan prompt
task (`task-prompt.ts`: produk, fitur, teknologi, spesifikasi, langkah, kriteria selesai) dirakit kode.

**Mengubah prompt:** `ai/build.prompt.ts` (dites di `tests/unit/specs-ai.test.ts`), lalu `pnpm eval:build`.
