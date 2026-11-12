# 0016 — Proyek eksisting: dua jalur satu hasil, sumber tidak disimpan

**Status:** diterima (2026-10-30, disetujui pengguna lewat B-05)

**Konteks.** Situs acuan punya kartu "Proyek eksisting" (*Copy prompt → Analisis codebase → Dokumentasi
tersimpan*) dan endpoint `workspaces/:id/codebase`, `codebase-status`, `wiki-versions`, `docs`,
`agent-token`. Semuanya hanya terlihat di bundle dan **tidak pernah
dijalankan**, jadi isi prompt, format dokumentasi, dan kontrak token di bawah adalah rancangan sendiri
dan tercatat "tidak terverifikasi". Pengguna memilih tiga sumber (prompt
untuk agen lokal Claude Code, upload ZIP, URL GitHub publik), analisis server memakai model yang sudah
ada, dokumentasi bisa diedit, dan chat dengan codebase ditunda.

## Keputusan

**Dua jalur, satu hasil.** Jalur agen: Claude Code pengguna membaca repo dan mengirim halaman dokumentasi
jadi (Piard hanya memvalidasi dan menyimpan; biaya model ditanggung kuota Claude pengguna). Jalur ZIP dan
GitHub: Piard memindai repo dan job `codebase-analyze` (Haiku, `getAi()`) menyusun halaman yang sama.
Keduanya menulis ke `codebase_docs` dan tampil sama; `origin` (`agent` | `ai` | `manual`) mencatat asalnya.

**Model data** (fitur `codebase`, satu-satunya pemilik tabel ini):

| Tabel | Isi |
|---|---|
| `codebases` | `user_id`, `workspace_id` (workspace bawaan), `name`, `language` (id/en, bahasa dokumentasi), `source` (agent/zip/github), `source_ref` (nama ZIP atau URL repo, **tanpa kredensial**), `status`, `error`, `detected_stack` JSON, `manifest` JSON, `source_received_at`, `analyzed_at` |
| `codebase_docs` | satu baris per versi halaman: `slug`, `title`, `content`, `version`, `origin`; unik `(codebase_id, slug, version)` seperti `documents` |
| `agent_tokens` | `token_hash` (SHA-256), `expires_at`, `revoked_at`, `last_used_at`, `window_started_at`/`window_count` (batas laju, migrasi 0003); token mentah tidak pernah disimpan |
| `plans.codebase_id` | plan fitur baru yang dibuat dari proyek; `ON DELETE SET NULL` agar plan tidak ikut terhapus |

Status: `awaiting_source` → `source_ready` (sumber diterima, menunggu konfirmasi biaya dan job) →
`analyzing` → `ready` | `failed`. Jalur agen langsung `awaiting_source` → `ready`. Sumber baru boleh
dikirim di semua status kecuali `analyzing` (409).

**Halaman dokumentasi standar** (urutan tetap; judul ditentukan server dari slug sehingga kiriman tidak
bisa menyisipkan judul):

| Slug | Judul (id) | Judul (en) |
|---|---|---|
| `ringkasan` | Ringkasan | Overview |
| `teknologi` | Teknologi | Tech stack |
| `struktur-folder` | Struktur folder | Folder structure |
| `arsitektur` | Arsitektur | Architecture |
| `modul` | Modul | Modules |
| `data` | Model data | Data model |
| `api` | API dan rute | API and routes |
| `alur-utama` | Alur utama | Main flows |
| `menjalankan` | Cara menjalankan | Running locally |
| `catatan` | Catatan dan utang teknis | Notes and tech debt |

Halaman yang tidak relevan boleh tidak dikirim; penampil menyebutnya "belum ada". Isi maks. 40.000
karakter per halaman, Markdown (GFM + mermaid). Skema Zod: `features/codebase/schemas.ts`.

**Kontrak kiriman agen** (`POST /api/codebase/agent/submit`, M7-07): `Authorization: Bearer pcb_…`,
badan `{pages: [{slug, content}], detectedStack?}` maks. 1 MB, slug unik dan harus standar. Token: 32
byte acak (base64url) berawalan `pcb_` (agar mudah dikenali dan disensor), berlaku 24 jam, satu aktif per
codebase, dibandingkan lewat hash dengan waktu konstan, dibatasi laju per token (20 permintaan per 10 menit,
dihitung di database karena Next memuat modul server lebih dari sekali). Token diperiksa **sebelum** badan
dibaca; semua penolakan token dijawab 401 dengan pesan yang sama. Isi kiriman disensor seperti isi repo.
Kiriman ulang menambah versi, tidak menimpa; status codebase menjadi `ready`. Kunci di luar `pages` dan
`detectedStack` ditolak (skema ketat), jadi `notes` bebas tidak diterima: catatan agen masuk ke halaman
`catatan`.

**Sumber kode tidak disimpan.** ZIP diurai **di memori**; tidak ada berkas dari arsip yang ditulis ke disk
dengan namanya sendiri, sehingga zip-slip dan symlink tidak bisa menyentuh sistem berkas (entri dengan
`..`, jalur absolut, atau huruf drive tetap ditolak sebagai tanda arsip rusak/berbahaya). Yang disimpan
sementara hanya berkas teks yang **sudah disaring dan disensor**, sebagai satu JSON di
`<folder database>/tmp/codebase/<id>.json` (folder 0700, berkas 0600). Berkas itu (beserta hasil antara
analisis `<id>.work.json`) dihapus saat analisis selesai atau dibatalkan dan saat codebase dihapus; saat analisis
**gagal** sengaja disimpan agar "Coba lagi" bisa melanjutkan, dan disapu saat boot bila lebih tua dari 24 jam.
Yang disimpan permanen: manifes (daftar berkas, ukuran, bahasa, jumlah yang dilewati dan disensor),
`detected_stack`, dan dokumentasi.

**Batas awal** (konstanta di `features/codebase/limits.ts`, upload bisa diubah lewat
`CODEBASE_MAX_UPLOAD_MB`; angka akan dikoreksi setelah eval M7-11):

| Batas | Nilai | Alasan |
|---|---|---|
| Ukuran upload | 50 MB | repo kecil-menengah tanpa `node_modules`; dibaca dengan batas byte, bukan percaya `Content-Length` |
| Byte terurai total | 200 MB | dihitung dari data yang benar-benar diurai (bukan ukuran yang diklaim arsip): menutup bom ZIP |
| Entri arsip | 20.000 | membatasi kerja parser walau sebagian besar diabaikan |
| Berkas teks disimpan | 5.000 | lebih dari ini repo terlalu besar untuk satu analisis |
| Ukuran per berkas | 1 MB | berkas lebih besar hampir selalu hasil build/data, dilewati dan dicatat |
| Jalur | 500 karakter, 30 tingkat | jalur ekstrem menandakan arsip buatan |
| Token masuk analisis | 400.000 (± 1,6 MB teks), potongan 24.000 | estimasi `karakter / 4`; berkas kunci diprioritaskan, sisanya dipotong dan dicatat |

**Penyaringan dan sensor** (`scanRepo`, fungsi murni): folder hasil build/dependensi (`.git`,
`node_modules`, `dist`, `build`, `.next`, `vendor`, …), lockfile, biner (ekstensi atau byte NUL atau
UTF-8 tidak valid), dan berkas kunci privat (`*.pem`, `*.key`, `id_rsa`, …) dilewati. Nilai di berkas
`.env*` diganti `[DISEMBUNYIKAN]` (nama variabel dipertahankan untuk halaman "Cara menjalankan"), begitu
pula blok kunci privat, pola token yang dikenal (AWS, GitHub, Stripe, Slack, Google, `sk-…`, JWT, `pcb_…`),
kredensial di URL, dan nilai literal untuk nama seperti `password`/`secret`/`token`/`api_key`. Sensor
terjadi **sebelum** apa pun disimpan atau dikirim ke model.

**Isi repo adalah data.** Prompt analisis membungkus isi berkas sebagai data dan menyatakan bahwa instruksi
di dalamnya tidak diikuti (M7-10).

**Batas fitur.** Fitur `codebase` memiliki tabel di atas. `plans`, `questions`, `roadmap`, `prd`, `specs`,
`tasks`, dan `export` hanya membacanya lewat `features/codebase/server.ts` (M7-18, M7-19).

## Model ancaman singkat

| Ancaman | Perlindungan |
|---|---|
| Zip-slip, symlink | tidak ada penulisan berdasarkan nama entri; jalur berbahaya menolak arsip |
| Bom ZIP | batas byte terurai nyata per berkas dan total; arsip dihentikan begitu terlampaui |
| Rahasia di repo terkirim ke model | sensor sebelum simpan/kirim; jumlahnya tampil di manifes |
| SSRF lewat URL GitHub | hanya host `github.com`/`codeload.github.com`/`api.github.com`, tanpa pengalihan ke host lain (M7-06) |
| Token agen bocor | hanya hash disimpan, kedaluwarsa 24 jam, bisa dicabut, tidak pernah dicatat di log |
| Akses lintas pengguna | semua query memfilter `user_id`; milik orang lain dijawab 404 |
| Injeksi prompt dari isi repo | isi dibungkus `<repo_file>`/`<notes>`/`<codebase_docs>` dan dinyatakan data; tag pembungkus di dalam isi dinetralkan; keluaran divalidasi skema |
| Edit manual tertimpa analisis ulang | halaman yang versi terbarunya `manual` hanya menerima usulan (`codebase_doc_proposals`), dari job server maupun agen |
| Rahasia/token di log | route hanya mencatat status dan kode galat; logger menyensor kunci rahasia; galat jaringan GitHub tidak dibawa sebagai `cause` (URL codeload bertoken) |
| Job menulis ke proyek terhapus | menghapus proyek membatalkan job analisis yang berjalan dan menghapus sumber sementara |

Kumpulan tes: `tests/integration/codebase-security.test.ts` (akses lintas pengguna ke semua endpoint,
zip-slip, bom ZIP, SSRF, sensor, injeksi prompt, izin folder, audit log; setiap perlindungan diuji balik
dengan melepasnya), ditambah `codebase-github.test.ts` (pengalihan) dan `codebase-agent.test.ts` (token).
Operasi (mencabut semua token, menghapus sisa sementara): [runbook](../runbook.md#proyek-eksisting-codebase).

## Konsekuensi

Analisis ulang dari ZIP/GitHub butuh upload ulang karena sumber tidak disimpan (harga dari privasi).
Sumber yang menunggu konfirmasi lebih dari 24 jam kedaluwarsa dan harus diunggah lagi. Penguraian di
memori memakai RAM sebesar upload + teks yang disimpan (± 50 MB + 200 MB terburuk), cukup untuk aplikasi
pribadi satu pengguna. Kontrak ini milik Piard sendiri, jadi tidak ada yang bisa dicocokkan dengan situs
acuan.
