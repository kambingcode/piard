# Fitur roadmap

Langkah 4 wizard: fitur utama per fase beserta sub-fiturnya, dibuat AI lalu bisa diedit (doc 07 R6, R7).

**Alur:** halaman langkah 4 membaca `getRoadmap` di server → `RoadmapStep` memulai job bila belum ada
(`POST /api/plan/roadmap/generate`) → job `roadmap` (`server/service.ts` `runJob`) mengalirkan keluaran
AI dan menyimpan tiap fitur yang lengkap → klien polling `GET ...?planId=` tiap 1,5 detik → node bertambah.
Keputusan desain: [ADR 0008](../../../docs/adr/0008-roadmap-job.md).

**Keadaan:** `idle` → `generating` (daftar berisi hasil parsial, `job.phase` reading/features/finishing)
→ `ready`, atau `failed` (pesan di `job.error`, tombol "Coba lagi" memanggil POST lagi).

**API:** `features/list|create`, `features/:id` (PATCH, DELETE), `subfeatures/list|create`,
`subfeatures/:id`. Sub-fitur membawa `featureId` = `parentId` (kontrak situs acuan). Mengubah fase fitur
ikut mengubah fase sub-fiturnya. Semua mutasi ditolak `409` selama job berjalan.

**UI:** graf React Flow di layar lebar (`roadmap-graph.tsx`; posisi dari `layout.ts`, fungsi murni,
zoom terbaca dan kanvas setinggi graf), daftar per fase di ponsel dan sebagai alternatif aksesibel.
Ganti nama langsung di node (ikon pensil), detail di panel kanan (autosave), hapus dengan Undo.

**Mengubah prompt:** `ai/roadmap.prompt.ts` (dites di `tests/unit/roadmap-ai.test.ts`), lalu
`pnpm eval:roadmap` (kasus klinik dari situs acuan; cek 5-8 fitur, fase, 3-5 sub-fitur, < 60 detik).
Mode mock memakai `ai/roadmap.mock.ts` dengan jeda 350 ms per fitur agar kemunculan bertahap terlihat.
