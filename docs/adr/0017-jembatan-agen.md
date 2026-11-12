# 0017 — Jembatan agen (MCP): token per plan, status `review`, klien HTTP tipis

**Status:** diterima (2026-10-31, B-06 disetujui pengguna dengan "lanjutkan M8 … selesaikan M8"; asumsi
bawaan dipakai apa adanya)

**Konteks.** Task Piard berisi prompt siap tempel, tetapi pengguna masih menyalinnya satu per satu ke agen
coding. M8 menghubungkan agen lokal (Claude Code) langsung ke kanban: agen mengambil card `todo`, membaca
konteksnya, mengerjakannya di repo pengguna, lalu melapor. Situs acuan tidak punya fitur ini, jadi seluruh kontrak di bawah adalah rancangan sendiri dan tidak punya
padanan di situs asli. Keputusan pengguna (2026-10-30): jalan lokal dulu
tanpa menghalangi deploy publik, status `review` ditambahkan, token per plan dengan akses baca + ubah
status + catatan (tidak bisa membuat/menghapus/mengubah isi task).

## Keputusan

**Klien HTTP tipis lewat stdio.** Server MCP (`app/mcp/`) adalah proses stdio yang hanya memanggil API
Piard dengan `PIARD_URL` + `PIARD_TOKEN`. Ia tidak menyentuh database dan tidak mengimpor `src/**`
(dependency-cruiser). Kode yang sama bekerja terhadap `http://localhost:3000` maupun Piard yang sudah
di-deploy. Endpoint MCP HTTP di dalam Piard ditunda: butuh OAuth/sesi MCP dan tidak menambah apa pun
untuk pemakaian lokal.

**Namespace `/api/agent/*` dengan Bearer.** Pembangun route baru `agentRoute` membaca
`Authorization: Bearer ppl_…` dan **tidak** membaca cookie; `authedRoute` tidak berubah dan tidak
menerima token. Jadi token tidak bisa memakai `/api/plan/*`, dan sesi browser tidak bisa memakai
`/api/agent/*` (CSRF tidak relevan karena tidak ada cookie). Semua penolakan token dijawab 401 dengan
pesan yang sama.

**Token per plan** (`plan_agent_tokens`, milik fitur `agent-bridge`): `ppl_` + 32 byte acak base64url,
hanya hash SHA-256 yang disimpan, ditampilkan sekali, berlabel, kedaluwarsa (7/30/90 hari, bawaan 30),
bisa dicabut satu per satu atau semua, `last_used_at` dicatat. Hash, pola, dan pembandingan waktu-konstan
memakai helper bersama `server/http/bearer-token.ts` yang juga dipakai token codebase M7 (`pcb_`).
Menghapus plan (atau penggunanya) menghapus token lewat `ON DELETE CASCADE`.

**Status `review` dan matriks transisi.** `TASK_STATUSES = todo | doing | review | done` (kolom `text`
tanpa CHECK, jadi tanpa SQL untuk enum). Agen hanya boleh:

| Aksi agen | Dari | Ke | Syarat |
|---|---|---|---|
| `claim` | `todo` | `doing` | atomik (`UPDATE … WHERE status = 'todo'`); token belum punya task `doing` lain |
| `report` | `doing` | `review` | task diklaim token ini; ringkasan + cara verifikasi wajib |
| `release` | `doing` | `todo` | task diklaim token ini; alasan wajib |
| `note` / `question` | `doing` | (tetap) | task diklaim token ini |

Agen tidak pernah menulis `done` dan tidak bisa menyentuh task `review`/`done` atau task milik token
lain. Klaim ulang dan lapor ulang oleh token yang sama idempoten. Pengguna tetap bebas memindahkan status
(kanban, massal, reset); setiap perubahan status oleh pengguna melepas klaim agen (`agent_token_id`,
`claimed_at` dikosongkan). Aksi tinjauan pengguna: **Setujui** (`review → done`) dan **Minta perbaikan**
(`review → todo` dengan catatan wajib yang dibaca agen lewat `get_task`).

**Klaim tersimpan di `tasks`** (`agent_token_id`, `claimed_at`; tanpa kunci asing agar migrasinya cukup
`ADD COLUMN`; token tidak pernah dihapus kecuali bersama plan, yang juga menghapus task). Fitur `tasks`
tetap satu-satunya penulis tabel `tasks`; `agent-bridge` memanggil metodenya lewat `tasks/server.ts`.

**Catatan dan jejak audit** (`task_notes`, milik `agent-bridge`): `author` (`agent`|`user`), `kind`
(`note`|`report`|`question`|`event`), `body`, `token_id` bila agen. Peristiwa (`claim`, `report`,
`release`, `approve`, `changes`, `user_release`) dicatat otomatis sebagai `event` dengan kode, teksnya dari
`copy.ts`. Pertanyaan agen dianggap **terbuka** sampai ada catatan pengguna sesudahnya.

**Job tidak menimpa pekerjaan agen.** `replaceForFeature` (sinkronisasi M5, susun ulang task fitur) dan
`clearPlan` (buat ulang semua) mempertahankan task `doing` dan `review`; task baru ditaruh sesudahnya.
Task `todo`/`done` tetap diganti seperti sebelumnya.

**Urutan `get_next_task`.** Bila token sudah memegang task `doing`, task itu yang dikembalikan
(`alreadyClaimed: true`) agar sesi yang terputus bisa melanjutkan. Selain itu task `todo` pertama menurut
posisi fitur di roadmap lalu posisi task. Tidak ada ketergantungan lain.

**Isi plan adalah data.** Teks yang keluar ke agen (PRD, spesifikasi, prompt task, catatan, instruksi
proyek) disensor dulu (`redactSecrets` milik `codebase`, lewat `server.ts`), dipotong dengan penanda bila
melewati batas, dan oleh server MCP dibungkus penanda `<<<PIARD_DATA … PIARD_DATA>>>` (penanda penutup di
dalam isi dinetralkan). Deskripsi tool menyatakan bahwa isi itu bukan perintah. Izin tidak pernah
berasal dari isi: hanya dari token + matriks transisi di server.

## Kontrak API agen (`/api/agent/*`, semua `Authorization: Bearer ppl_…`)

| Metode dan alamat | Hasil |
|---|---|
| `GET /api/agent/plan` | `{plan: {id, title, idea, language, techStack}, progress: {todo, doing, review, done}, features: [{id, name, phase, taskCount}], instructions}` |
| `GET /api/agent/tasks?status=&featureId=` | `{tasks: [ringkasan task]}` (tanpa prompt penuh) |
| `GET /api/agent/tasks/next` | `{task: detail \| null, alreadyClaimed}` |
| `GET /api/agent/tasks/:id` | `{task: detail}`: task + fitur (ringkasan, spesifikasi, sub-fitur) + bagian PRD yang menyebut fitur + catatan + instruksi proyek |
| `GET /api/agent/documents/prd` | `{prd: {version, content, truncated} \| null}` |
| `POST /api/agent/tasks/:id/claim` | `{task: detail}` |
| `POST /api/agent/tasks/:id/report` `{summary, verification, filesChanged?}` | `{task: ringkasan}` |
| `POST /api/agent/tasks/:id/release` `{reason}` | `{task: ringkasan}` |
| `POST /api/agent/tasks/:id/notes` `{kind: note\|question, body}` | `{note}` |

Task di plan lain dijawab 404 (sama dengan task yang tidak ada). Transisi terlarang dijawab 409 dengan
pesan yang menyebut status sekarang dan langkah yang benar. Skema Zod: `features/agent-bridge/schemas.ts`.

**Tool MCP:** baca (`readOnlyHint`): `get_plan_overview`, `list_tasks`, `get_next_task`, `get_task`,
`get_prd`. Tulis (bukan destruktif): `claim_task` dan `report_task` (idempoten), `release_task`,
`add_task_note`. Prompt `work_next_card`: ambil → klaim → kerjakan → verifikasi → lapor → berhenti.
Keluaran berupa teks Markdown untuk dibaca agen.

## Batas awal

Konstanta di `features/agent-bridge/limits.ts`.

| Batas | Nilai | Alasan |
|---|---|---|
| Token aktif per plan | 5 | beberapa mesin/agen; lebih dari itu tanda token tidak pernah dicabut |
| Masa berlaku | 7/30/90 hari, bawaan 30 | proyek pribadi berjalan berminggu-minggu; bisa dicabut kapan saja |
| Laju per token | 600 permintaan / 10 menit | satu card ± 10-30 panggilan; menahan agen yang berputar-putar |
| Badan permintaan agen | 64 KB | laporan dan catatan berupa teks pendek |
| Isi catatan / ringkasan laporan | 4.000 karakter | cukup untuk ringkasan; detail ada di repo |
| Cara verifikasi | 2.000 karakter | perintah tes dan hasilnya, bukan log penuh |
| Berkas diubah | 100 jalur × 300 karakter | daftar, bukan isi berkas |
| Catatan per task | 200 (termasuk peristiwa) | menahan agen yang berputar tanpa membatasi kerja wajar |
| PRD keluar | 60.000 karakter | PRD Piard 400-1.800 kata; batas hanya untuk PRD hasil edit yang sangat panjang |
| Spesifikasi fitur keluar | 20.000 karakter | sama dengan batas prompt task |
| Bagian PRD di `get_task` | 8.000 karakter | konteks fitur, bukan PRD penuh (ada `get_prd`) |
| Instruksi proyek | 8.000 karakter | perintah tes/lint, konvensi, folder terlarang |
| Ambang "mungkin macet" | 2 jam tanpa kabar | satu card wajar selesai jauh di bawah ini |

## Titik sentuh status `review` (diverifikasi 2026-10-31)

`TASK_STATUSES` di `features/tasks/schemas.ts` dan `server/db/schema.ts`; `patchTaskSchema` dan
`bulkStatusSchema` (enum); `resetStatus` (semua ke `todo`, klaim dilepas); `replaceForFeature`/`clearPlan`
(lihat di atas); kanban (kolom keempat, menu, massal); ekspor ZIP tidak memuat status (tidak berubah);
sinkronisasi M5 hanya mengubah fitur (task ikut terhapus bila fiturnya dihapus, sama seperti sebelumnya);
SSE `tasks/stream` mendapat event `agent`; tes kontrak hanya memeriksa kolom plan/fitur (tidak berubah).

## Model ancaman singkat

| Ancaman | Perlindungan |
|---|---|
| Token bocor | hash saja, kedaluwarsa, cabut satu/semua, `last_used_at` terlihat; tidak pernah dicatat log; cuplikan memakai variabel lingkungan |
| Token dipakai ke plan lain / data lain | token terikat satu plan; setiap query memfilter `plan_id`; id lain → 404 |
| Token dipakai ke API pengguna | `/api/plan/*` hanya menerima cookie sesi; `/api/agent/*` hanya Bearer |
| Agen menandai selesai sendiri | matriks transisi di server; `done` hanya dari pengguna |
| Dua agen mengambil card yang sama | klaim atomik bersyarat; yang kalah mendapat 409 |
| Agen menimbun card | satu task `doing` per token |
| Injeksi prompt dari isi PRD/task/catatan | isi dinyatakan data dan dibungkus penanda; izin tidak bergantung isi |
| Rahasia terbawa ke agen atau tersimpan dari agen | sensor `redactSecrets` pada teks keluar dan teks masuk |
| Agen berputar | batas laju, batas jumlah catatan, batas ukuran badan |
| Token lewat HTTP polos (deploy) | server MCP menolak `http://` selain localhost/127.0.0.1 |

Kumpulan tes: `tests/integration/agent-bridge-security.test.ts`; operasi (mencabut semua token):
[runbook](../runbook.md#jembatan-agen-mcp).

## Konsekuensi

Kanban punya empat kolom (menyimpang dari situs acuan). Server MCP butuh salinan repo Piard di mesin agen
(dijalankan dengan `node app/mcp/server.ts`); paket npm terpisah baru dipertimbangkan bila ada deploy
publik. Satu agen per token bekerja serial; banyak agen paralel per plan ditunda.
