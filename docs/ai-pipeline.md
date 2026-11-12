# Pipeline AI

Setiap tugas AI memakai satu model yang diatur lewat `MODEL_<TUGAS>` di `.env`. ID berbentuk `vendor/model`
lewat OpenRouter (`OPENROUTER_API_KEY`); ID berawalan `claude-` (mis. `claude-haiku-5-5`) dipanggil langsung ke
API Anthropic (`ANTHROPIC_API_KEY`), dan biayanya dihitung dari token dengan tabel harga di
`src/server/ai/usage.ts` karena Anthropic tidak melaporkan biaya per panggilan. Semua panggilan
melewati `src/server/ai/client.ts` (`generateStructured` / `streamText` / `streamChat`), yang memvalidasi keluaran dengan Zod
dan mencatat token serta biaya ke tabel `usage`. `LLM_MODE=mock` memakai fixture deterministik tanpa jaringan.

Model per tugas juga bisa diganti di halaman **Pengaturan** (`/settings`): berlaku mulai panggilan berikutnya
tanpa mulai ulang dan menimpa `.env` ([ADR 0013](adr/0013-pengaturan.md)). Setiap panggilan diperiksa
terhadap batas biaya harian/bulanan ([ADR 0012](adr/0012-batas-biaya.md)); token dan biaya per run terlihat
di tab **Pemakaian** setiap plan. Tabel di bawah adalah default `.env` yang dipilih dari hasil uji.

| Tugas | Variabel | Model default | Status |
|---|---|---|---|
| Pertanyaan klarifikasi | `MODEL_QUESTIONS` | `claude-haiku-5-5` (langsung ke Anthropic) | Dipilih di M1-08 |
| Roadmap | `MODEL_ROADMAP` | `claude-haiku-5-5` (langsung ke Anthropic) | Dipilih di M2-06 |
| PRD | `MODEL_PRD` | `claude-haiku-5-5` (langsung ke Anthropic) | Diganti pengguna 2026-10-30 (Nemotron 155 dtk sebelum teks pertama) |
| Spesifikasi | `MODEL_SPEC` | `claude-haiku-5-5` (langsung ke Anthropic) | Diganti pengguna 2026-10-29 (kuota gratis) |
| Task | `MODEL_TASKS` | `claude-haiku-5-5` (langsung ke Anthropic) | Diganti pengguna 2026-10-29 (kuota gratis) |
| Chat revisi + penyesuaian fitur | `MODEL_CHAT` | `claude-haiku-5-5` (langsung ke Anthropic) | Diganti pengguna 2026-10-30 (Nemotron sampai 262 dtk) |
| Analisis proyek eksisting | `MODEL_CODEBASE` | boleh kosong: `claude-haiku-5-5` bila `ANTHROPIC_API_KEY` ada, selain itu `anthropic/claude-haiku-5.5` | M7-11 (eval di bawah) |

## Pertanyaan klarifikasi

- **Masukan:** `idea`, `language` (`id`/`en`), teknologi yang dipilih pengguna (pilihan "AI pilih" tidak disebut),
  `extras`.
- **Prompt:** `src/features/questions/ai/questions.prompt.ts` (fungsi murni). Menuntut 5 pertanyaan berurutan
  `real_user_pain` (text), `first_win`, `must_have_features` (multi), `main_advantage`, `come_back_reason`.
  Opsi berupa frasa 2-5 kata dengan istilah domain; opsi `come_back_reason` berupa pemicu kembali, bukan nama
  fitur; `must_have_features` boleh memuat 1-2 fitur tersirat.
- **Skema:** `src/features/questions/ai/questions.schema.ts`: tepat 5 item, id snake_case unik, `text` tanpa opsi,
  pilihan 3-6 opsi tanpa duplikat. Keluaran yang tidak lolos skema menjadi `UPSTREAM_AI`.
- **Contoh keluaran** (Haiku 5.5, ide klinik booking):
  - [text] Siapa orang nyata yang paling butuh aplikasi ini, dan apa yang mereka lakukan sekarang untuk mencari
    dokter serta membuat janji?
  - [multi_choice] Fitur mana saja yang wajib ada di versi pertama aplikasi ini?
    Pencarian dokter per lokasi | Pembayaran QRIS | Pengingat WhatsApp otomatis | Dasbor jadwal dokter |
    Daftar pasien untuk dokter | Pembatalan dan jadwal ulang
  - [single_choice] Apa yang membuat pasien kembali memakai aplikasi ini, bukan hanya mencobanya sekali?
    Pengingat jadwal kontrol | Riwayat berobat tersimpan | Booking ulang dokter sama | Kontrol ulang lebih mudah |
    Catatan kemajuan kesehatan

### Hasil uji M1-08 (2026-10-29)

Tiga ide: klinik booking (id, sedang), habit tracker untuk tim remote (en, satu kalimat), katering UMKM (id,
panjang, dengan stack Next.js + PostgreSQL dan extras). Angka per panggilan, rata-rata dari 3 ide.

| Model | Lolos skema | Latensi | Biaya / panggilan | Catatan |
|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 3/3 | ±8 dtk | ±US$0,0009 | Pertanyaan paling tajam dan spesifik domain; menambah fitur tersirat. **Default.** |
| `openai/gpt-6-luna` | 3/3 | ±11 dtk | ±US$0,0006 | Opsi paling ringkas, tetapi lebih generik; sebelum prompt diperketat opsi `come_back_reason` hanya daftar fitur. |
| `deepseek/deepseek-v4.1-flash` | 3/3 | ±21 dtk | ±US$0,0004 | Bahasa santai bagus, tetapi lambat dan opsi sering lebih dari 5 kata. |
| `nvidia/nemotron-3.5-super-vl:free` | 3/3 (ide klinik) | 29-41 dtk | gratis | Cadangan tanpa biaya; terlalu lambat untuk default. |

Model gratis lain (`xingchen-agi/xing4.0-29b-a4b:free`, `dots-studio/dots-3-note-preview:free`, `openrouter/free`)
gagal format keluaran; `google/gemma-4-31b-it:free` gagal di penyedia. Model embedding tidak bisa dipakai.

Iterasi prompt sesudah putaran pertama: aturan panjang opsi dipisah menjadi "frasa 2-5 kata", ditambah aturan
`come_back_reason` dan fitur tersirat, dan `first_win` diperjelas "pada kunjungan pertamanya" (Haiku sempat
mengubahnya menjadi "satu hal terpenting").

## Roadmap

- **Masukan:** ide, bahasa, teknologi pilihan, extras, dan pasangan pertanyaan-jawaban klarifikasi yang
  dijawab (yang dilewati tidak disebut).
- **Prompt:** `src/features/roadmap/ai/roadmap.prompt.ts`. Meminta `title` 2-4 kata (tanpa nama orang dari
  jawaban), 5-8 fitur dari sudut pandang pengguna (paling banyak 8; yang berdekatan digabung), fase 1..5
  tanpa lompatan dengan fase 1 = hasil pertama bagi pengguna, 3-5 sub-fitur per fitur, ikon dari daftar
  `icons.ts`, tanpa fitur infrastruktur.
- **Skema:** `roadmap.schema.ts`, sub-fitur **bersarang** di fiturnya ([ADR 0008](adr/0008-roadmap-job.md)).
  Batas skema lebih longgar (3-10 fitur, 1-8 sub-fitur) daripada target prompt; target diperiksa eval.
- **Aliran:** `AiClient.streamStructured` mengirim objek parsial; job menyimpan setiap fitur yang lengkap
  sehingga node muncul bertahap, lalu merapikan fase dan urutan di akhir. Ikon tak dikenal diganti tebakan
  dari kata kunci nama.

### Hasil uji M2-06 (2026-10-29)

Kasus klinik booking dari situs acuan (`analysis/api-samples/plan-get-after-roadmap.json`: ide panjang,
5 pertanyaan, 5 jawaban). "Fitur pertama" = kapan node pertama bisa tampil.

| Model | Lolos cek | Selesai | Fitur pertama | Biaya / run | Catatan |
|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 4/5 run, 2/2 sesudah prompt diperketat | 11-26 dtk | 5-19 dtk | US$0,0013-0,003 | Ringkasan paling kaya istilah domain dan setia pada jawaban. **Default.** Sebelum aturan baru: sekali 9 fitur, sekali judul memakai nama persona ("Klinik Dewi Booking"). |
| `openai/gpt-6-luna` | 3/3 | ±17 dtk | 9-11 dtk | ±US$0,0012 | Alternatif termurah; node pertama lebih cepat, ringkasan sedikit lebih generik. |
| `nvidia/nemotron-3.5-super-vl:free` | struktur lolos | 103 dtk | 103 dtk | gratis | Gagal target < 60 detik dan tidak mengalir (semua fitur muncul di akhir). |
| `anthropic/claude-sonnet-5.5` | tidak diuji | | | | Saldo OpenRouter tidak cukup; pengguna memilih model gratis untuk saat ini. |

Uji lewat aplikasi (job runner + polling, model Haiku, ide katering): `ready` dalam 12,3 detik; fitur
terbaca bertambah 0→1→2→3→4→5→7 antara detik 6 dan 12.

**Contoh keluaran** (Haiku, kasus klinik, 2026-10-30; 14,7 dtk, US$0,0018; perbandingan dengan situs acuan
dicatat lokal): judul "Booking Klinik Sehat";
`[F1] Cari Dokter (search)`: "Pasien bisa menemukan dokter yang tepat sesuai spesialis dan lokasi tanpa harus
menelepon klinik." dengan sub-fitur Filter Spesialis | Filter Lokasi | Lihat Jadwal Praktik | Profil Dokter;
`[F1] Booking Janji Temu (calendar)`, `[F1] Pembayaran Online (wallet)`, `[F1] Pengingat WhatsApp (bell)`,
`[F2] Dashboard Dokter (dashboard)`, `[F3] Kelola Klinik (chart)`, `[F4] Ulasan Pasien (star)`.

## PRD

- **Masukan:** judul plan, ide, bahasa, teknologi pilihan, extras, jawaban klarifikasi, dan roadmap
  (fitur berurutan beserta fase dan sub-fiturnya). Roadmap wajib sudah `ready`.
- **Prompt:** `src/features/prd/ai/prd.prompt.ts`. Keluaran **Markdown biasa** (bukan JSON) agar bisa
  dialirkan: `# PRD - <nama>` lalu tujuh bagian berjudul persis (`PRD_SECTIONS` di `structure.ts`, per
  bahasa), Fitur Inti mengikuti roadmap, `sequenceDiagram` di Arsitektur dan `erDiagram` di Skema Database
  dengan aturan sintaks mermaid yang ketat (id peserta satu kata, entitas HURUF_BESAR, atribut `tipe nama`).
- **Aliran dan simpan:** job `prd` ([ADR 0009](adr/0009-prd-job.md)) memakai `AiClient.streamText`; teks
  sejauh ini disimpan di memori (draf) dan dibaca polling `GET /api/plan/generate`. Di akhir, `cleanPrd`
  membuang teks pembuka, pembungkus ```markdown, dan pagar ``` ganda; `checkPrdStructure` menolak PRD
  tanpa judul, bagian, atau salah satu diagram (job gagal, tidak ada versi setengah jadi).
- **Contoh pola yang dirapikan:** Nemotron sempat menulis "```" tepat sebelum "```mermaid" dan sesudah
  penutupnya (blok kode kosong di tampilan); kini dibuang `cleanPrd` dan prompt melarangnya.

### Hasil uji M3-05 (2026-10-29)

Kasus klinik booking dari situs acuan (ide, jawaban, dan roadmap 7 fitur di `analysis/api-samples/`).
Cek `evals/prd-checks.ts`: judul, 7 bagian berurutan, kedua diagram ada dan lolos `mermaid.parse`, pagar
kode berpasangan, semua fitur roadmap disebut, 400-1800 kata, selesai < 180 detik.

| Model | Lolos cek | Selesai | Teks pertama | Biaya / run | Catatan |
|---|---|---|---|---|---|
| `nvidia/nemotron-3.5-super-vl:free` | 2/2 run (run pertama sebelum aturan pagar: blok kosong) | 40-52 dtk | 27-42 dtk | gratis | ±4.000 token penalaran sebelum teks; isi rinci dan setia pada roadmap. **Default** (pilihan pengguna). |
| `claude-haiku-5-5` | 1/1 | 24 dtk | 9 dtk | US$0,0034 | Lebih cepat mengalir, lebih panjang (±1.250 kata). Cadangan bila model gratis bermasalah. |

Uji ulang 2026-10-30 (Nemotron, kasus klinik): 8/8 cek lolos, 915 kata, tetapi **teks pertama baru muncul
pada 155 dtk** dan selesai 171 dtk (batas eval 180 dtk). Waktu tunggu model gratis berubah-ubah; bila
sering melewati batas, ganti `MODEL_PRD` ke `claude-haiku-5-5` di halaman Pengaturan.

**Contoh keluaran** (Nemotron, awal PRD):

```markdown
# PRD - Booking Klinik

## 1. Ringkasan
Pasien masih perlu telepon klinik berkali-kali, antre lama, dan sering lupa jadwal kontrol. Aplikasi ini
dibuat untuk pasien, dokter, dan admin klinik agar janji temu dapat dibuat tanpa antre, dibayar online, dan
diingatkan melalui WhatsApp maupun email. …

## 2. Kebutuhan
- Pasien dapat daftar dan masuk dengan Google atau nomor HP.
- Pasien mencari dokter berdasarkan spesialis, lokasi, dan cabang klinik.
…
```

Bagian berikutnya: `## 3. Fitur Inti`, `## 4. Alur Pengguna`, `## 5. Arsitektur` (sequenceDiagram),
`## 6. Skema Database` (erDiagram), `## 7. Desain & Batasan Teknis`.

Uji lewat aplikasi (build produksi, Haiku untuk pertanyaan/roadmap, Nemotron untuk PRD, ide katering kantor):
bagian pertama muncul ±75 detik setelah halaman dibuka, PRD tersimpan sebagai v1 dalam 87 detik, kedua
diagram tergambar di tema terang dan gelap, tanpa galat konsol, tanpa gulir horizontal di 390px.

## Spesifikasi & task

- **Masukan per fitur:** produk, ide, teknologi pilihan, PRD terbaru (dipotong 16 ribu karakter), nama
  semua fitur roadmap (agar tidak mengambil wilayah fitur lain), fitur yang dikerjakan beserta sub-fiturnya.
- **Spesifikasi** (`MODEL_SPEC`, `buildSpecPrompt`): keluaran `{feature: {goal, needs[3-6]},
  subFeatures: [{name, goal, needs[2-4]}]}`; dirakit `renderSpec` menjadi `### Tujuan` + `### Yang
  dibutuhkan`. Sub-fitur dicocokkan menurut nama, lalu urutan.
- **Task** (`MODEL_TASKS`, `buildTasksPrompt`, dengan spesifikasi sebagai konteks): 3-8 task (biasanya
  4-6) `{title, description, steps[3-6], done[2-4]}`; prompt siap tempel dirakit `renderTaskPrompt`
  ([ADR 0010](adr/0010-build-job.md)). Sebelumnya model diminta menulis prompt sendiri: Nemotron kadang
  menulis 22-39 kata per prompt dan tidak menyebut fiturnya.

**Kuota model gratis:** OpenRouter membatasi model `:free` 50 permintaan per hari tanpa kredit (1.000
setelah isi kredit $10). Satu plan memakai ±17 permintaan gratis bila PRD, spesifikasi, dan task memakai
Nemotron; sejak spesifikasi dan task dipindah ke Haiku (2026-10-29) tinggal 1 untuk PRD, ditambah 1 per
pesan chat, revisi PRD, dan penyesuaian fitur. Bila kuota habis, job berhenti dengan pesan "Kuota harian model gratis OpenRouter habis";
fitur yang sudah selesai tetap tersimpan dan "Lanjutkan" mengerjakan sisanya.

**Contoh keluaran** (Haiku, fitur "Booking Dokter" kasus klinik, 2026-10-30; spesifikasi 6,2 dtk
US$0,001, task 24,6 dtk US$0,0027):

```markdown
### Tujuan
Pasien dapat mencari dokter yang tepat dan memesan jadwal konsultasi tanpa perlu antre atau menelepon klinik.

### Yang dibutuhkan
- Pasien dapat memfilter dokter berdasarkan spesialis, kota/lokasi, dan cabang klinik.
- Jam yang sudah dibooking atau tidak aktif tidak bisa dipilih lagi.
- …
```

Task: 1. Buat endpoint pencarian dokter dengan filter · 2. Buat halaman Cari Dokter dengan kartu dan empty
state · 3. Buat endpoint jadwal dan perhitungan slot jam · 4. Buat halaman Lihat Jadwal dan Pilih Jam ·
5. Buat endpoint konfirmasi booking dan integrasi Midtrans · 6. Buat halaman konfirmasi booking dan uji alur
lengkap. Prompt siap tempel 290-349 kata.

### Hasil uji M4 (2026-10-29)

Kasus klinik booking dari situs acuan dengan PRD Nemotron dari M3-05 (`pnpm eval:build --prd ...`).
Cek `evals/build-checks.ts`: 3-6 kebutuhan, tujuan satu kalimat, semua sub-fitur berspesifikasi dengan
nama sama, 3-8 task, judul ≤ 12 kata, 3-8 langkah per task, prompt rakitan 80-450 kata.

| Model (spec + task) | Lolos cek | Waktu per fitur | Biaya per fitur | Catatan |
|---|---|---|---|---|
| `nvidia/nemotron-3.5-super-vl:free` | 3/3 fitur | 73-115 dtk (sekali spesifikasi 178 dtk) | gratis | Spesifikasi konkret dan selaras PRD (tabel, Midtrans). **Default** (pilihan pengguna). 7 fitur ±4-6 menit. |
| `claude-haiku-5-5` | 2/2 fitur | 26-28 dtk | ±US$0,0037 | Langkah lebih rinci (prompt ±300 kata). 7 fitur ±1 menit, ±US$0,03. |

## Chat revisi

- **Chat** (`MODEL_CHAT`, `buildChatSystem`, `streamChat`): prompt sistem berisi PRD terbaru dan fitur
  roadmap dengan id; riwayat 20 pesan terakhir sebagai teks (tindakan diringkas, mis.
  `[updatePrd: ... (done)]`). Satu langkah: teks balasan dan, bila diminta perubahan, tool `updatePrd`
  `{instructions, summary}` dan/atau `proposeFeatureChanges` `{changes[]}` ([ADR 0011](adr/0011-chat-revisi.md)).
- **Revisi PRD** (`MODEL_PRD`, `buildRevisePrompt`): PRD ditulis ulang utuh dengan aturan format yang sama
  (`prdFormatRules`), lalu dicek seperti PRD baru.
- **Sesuaikan fitur dengan PRD** (`MODEL_CHAT`, `buildReconcilePrompt`, `generateStructured`): keluaran
  `{changes[]}` yang sama dengan tool; kosong berarti roadmap sudah sesuai.

### Hasil uji M5 (2026-10-29)

`pnpm eval:chat`: tiga pesan pada PRD klinik (pertanyaan → tanpa tool; edit kebutuhan → `updatePrd`;
fitur baru → keduanya, perubahan harus lolos `normalizeChanges`).

| Model | Lolos | Waktu | Biaya per pesan | Catatan |
|---|---|---|---|---|
| `claude-haiku-5-5` | 3/3 | 2-6 dtk | ±US$0,0005-0,001 | Ringkasan dan perubahan tepat; menulis Markdown (dirender di panel). |
| `nvidia/nemotron-3.5-super-vl:free` | 3/3 (2026-10-30) | 9-262 dtk | gratis | Tool dipanggil tepat; skenario "tambah fitur" butuh 262 dtk. Ganti ke Haiku di Pengaturan bila chat terasa macet. |

**Contoh keluaran** (Nemotron, "tambahkan enkripsi data medis"): tool `updatePrd` dengan summary "Menambahkan
kebutuhan non-fungsional enkripsi data medis saat disimpan di PRD Booking Klinik." dan balasan "Saya akan
menambahkan kebutuhan non-fungsional baru di bagian “Kebutuhan” PRD: semua data medis yang disimpan di database
harus dienkripsi …"

## Analisis proyek eksisting (M7-10, M7-11)

Job `codebase-analyze` (`src/features/codebase/server/analyze.ts`) menyusun 10 halaman dokumentasi standar
(ADR 0016) dari sumber ZIP/GitHub yang sudah disaring dan disensor. Tiga langkah, hasil tiap langkah disimpan
di berkas kerja di samping sumber (`<id>.work.json`) sehingga job melanjutkan setelah restart atau "Coba lagi":

1. **Profil** (1 panggilan): pohon berkas (maks. 600 jalur) + berkas kunci (README, manifes, konfigurasi,
   skema, titik masuk; ±12 ribu "token anggaran") → `purpose`, `architecture`, `entryPoints`, `modules`.
2. **Ringkas** (1 panggilan per potongan dari `packFiles`, 3 paralel): catatan Markdown bersekat
   `## Modul / Data / API / Alur / Konfigurasi / Catatan`, maks. ±800 kata.
3. **Halaman** (10 panggilan, 3 paralel): tiap halaman hanya menerima **bagian ringkasan yang relevan**
   (`PAGE_SECTIONS`, mis. halaman `data` hanya `## Data`), maks. 100 ribu karakter bahan. Halaman disimpan
   begitu selesai (`origin = ai`); bila versi terbarunya hasil edit manual, hasilnya menjadi usulan (M7-16).

Isi repo selalu dibungkus `<repo_file path="…">`/`<notes>` dan dinyatakan sebagai data; tag pembungkus di dalam
isi dinetralkan agar berkas tidak bisa "keluar" dari pembungkus (`tests/unit/codebase-analyze-prompt.test.ts`).
Prompt: `ai/analyze.prompt.ts`, skema: `ai/analyze.schema.ts`, mock bernama nyata: `ai/analyze.mock.ts`,
rencana + perkiraan biaya: `ai/analyze.plan.ts`.

**Perkiraan biaya** (sebelum job, M7-12) dihitung dari prompt yang benar-benar akan dikirim, per panggilan
(tarif konteks panjang Haiku berlaku per panggilan di atas 100 ribu token masuk), dengan rasio tokenizer
terukur **2,1 karakter/token** (`ESTIMATE_CHARS_PER_TOKEN`) dan rata-rata keluaran terukur (profil 1.800,
ringkasan 3.500, halaman 4.200 token). Konfirmasi diminta bila > US$0,50, > 20% sisa anggaran bulanan, atau
harga model belum diketahui (model OpenRouter). Catatan: anggaran pemaket (`ANALYSIS_TOTAL_TOKENS` dll.)
memakai satuan karakter/4, bukan token tokenizer; nyatanya ±2× lebih banyak token.

### Hasil uji M7-11 (2026-10-30, `claude-haiku-5-5`)

| Repo | Berkas teks | Potongan / panggilan | Waktu | Token masuk / keluar | Biaya | Perkiraan |
|---|---|---|---|---|---|---|
| `piard/app` (sebelum pemilahan bagian) | 500 | 18 / 29 | 218 dtk | 1.384.922 / 122.852 | US$0,200 | US$0,096 (−52%, rasio 4 kar/token) |
| `piard/app` (pemilahan bagian) | 500 | 18 / 29 | 171 dtk | 950.436 / 106.595 | US$0,148 | US$0,160 (+8%, terkalibrasi) |
| `src/features/codebase` | 27 | 2 / 13 | 78 dtk | 120.517 / 38.930 | US$0,032 | US$0,038 (+22%), token masuk +8% |

Rincian `piard/app` (pemilahan bagian): profil 32.509 masuk (2,03 kar/token) / 1.744 keluar; ringkasan
18× 759.242 masuk (2,25) / rata-rata 3.471 keluar; halaman 10× 158.685 masuk (2,05) / rata-rata 4.237 keluar.
Pemilahan bagian memangkas masukan langkah halaman ±4× (perkiraan lama ±600 ribu → 159 ribu token).

Cek (`evals/codebase-checks.ts`): 10 halaman ada ✓, mermaid `arsitektur` lolos `mermaid.parse` ✓, jalur
karangan 2/230 dan 2/110 (≤ 2%, yang tersisa sah: "periksa `.nvmrc` jika ada", berkas di folder induk) ✓,
tanpa rahasia ✓, perkiraan token masuk dalam ±35% ✓. Isi halaman merujuk berkas nyata (mis. modul
`src/features/plans/server/repo.ts`, lapisan route → service → repo) dan arsitektur benar.

### Uji manual lewat aplikasi (M7-22, `claude-haiku-5-5`)

Build produksi (`next start`) + DB sementara, alur API sama dengan UI: `create` → sumber → `estimate` →
`analyze` → `status`.

| Jalur | Repo | Berkas | Panggilan | Waktu | Token masuk / keluar | Biaya | Perkiraan |
|---|---|---|---|---|---|---|---|
| ZIP (2026-10-30) | `src/features/codebase/scan` (2 rahasia palsu tersensor) | 7 | 12 | 61 dtk | 44.700 / 25.300 | US$0,017 | US$0,029 (+70%) |
| URL GitHub (2026-10-31) | `sindresorhus/is-plain-obj` | 14 | 12 | 40 dtk | 26.285 / 16.489 | US$0,011 | US$0,027 (+152%) |

Keduanya 10/10 halaman, tanpa konfirmasi (di bawah ambang, benar). Halaman jalur GitHub dibaca: semua jalur
yang disebut ada di repo, mermaid `arsitektur` rapi, hal yang tidak terlihat ditulis di "Yang belum jelas"
alih-alih dikarang. Sumber sementara terhapus setelah sukses. Pada repo sangat kecil perkiraan melebihi aktual
karena rata-rata keluaran per halaman (4.200 token) diukur pada repo besar; aman sebagai batas atas dan jauh di
bawah ambang konfirmasi, jadi tidak dikalibrasi ulang.

`mermaid.parse` di Node gagal untuk semua diagram berlabel ("DOMPurify.addHook is not a function") walau
sintaksnya benar; `evals/mermaid-node.ts` memberi DOMPurify pengganti tanpa-op sebelum mermaid dimuat (sintaks
rusak tetap ditolak). Cek PRD (`evals/prd-checks.ts`) ikut memakainya.

### Konteks codebase di pipeline plan (M7-19)

Plan fitur baru dari proyek eksisting (`plans.codebase_id`) membawa dokumentasi proyek ke prompt pertanyaan,
roadmap, PRD, spesifikasi, dan task: halaman ringkasan, teknologi, modul, dan data versi terbaru, dipotong per
halaman (`CONTEXT_PAGE_CHARS`, ±11 ribu token Haiku), dibungkus `<codebase_docs>` sebagai data
(`formatCodebaseContext`, `features/codebase/context.ts`; service: `contextFor`). Aturan tambahan per tugas:
pertanyaan tentang fitur baru saja; roadmap **hanya fitur baru** dan judul = nama fitur; PRD tetap 7 bagian,
sistem yang ada masuk bagian arsitektur/data; spesifikasi dan task menyebut modul/berkas nyata tanpa mengarang.
Plan tanpa codebase menghasilkan prompt identik byte-per-byte (`tests/unit/codebase-context-prompts.test.ts`,
hash terkunci).

**Hasil uji (2026-10-30, `claude-haiku-5-5`, `pnpm eval:roadmap --codebase`):** ide "bagikan plan lewat tautan
publik baca-saja" untuk Piard sendiri dengan dokumentasi dari eval M7-11 (`evals/fixtures/piard-docs`): 6 fitur
baru (Buat Tautan Publik, Halaman Baca Publik, Masa Berlaku Tautan, Cabut Tautan, Versi Tautan, Statistik
Kunjungan), judul "Tautan Bagikan Plan", 0 fitur lama terulang, memakai konteks (sub-fitur "Kunci ke versi
tertentu" karena dokumentasi menyebut PRD berversi). 14,1 dtk, 11.837 + 2.468 token, US$0,0024. Semua cek
roadmap lama lolos.

## Mengubah prompt

Setiap tugas punya berkas di `src/features/<fitur>/ai/`: `*.prompt.ts` (fungsi murni: masukan → `system` +
`prompt`), `*.schema.ts` (Zod untuk keluaran terstruktur), dan `*.mock.ts` (fixture `LLM_MODE=mock`).
Alurnya:

1. Ubah fungsi prompt. Tes unit `tests/unit/<fitur>-ai.test.ts` memastikan aturan penting tetap ada di teks
   prompt dan fixture lolos skema.
2. Bila skema berubah, sesuaikan fixture mock dan normalisasi (mis. `roadmap.normalize.ts`), lalu
   `pnpm check`.
3. Jalankan eval tugas itu dengan model nyata (di bawah) dan bandingkan dengan tabel hasil uji di dokumen
   ini; catat hasil baru beserta tanggalnya.

## Menjalankan uji

```bash
pnpm llm:check                         # cek konfigurasi + satu ping per model unik
pnpm llm:check --questions             # 3 ide dengan MODEL_QUESTIONS
pnpm llm:check --questions --models anthropic/claude-haiku-5.5,openai/gpt-6-luna   # bandingkan model
pnpm llm:check --questions --models claude-haiku-5-5   # Haiku langsung ke Anthropic
pnpm eval:roadmap                      # kasus klinik dengan MODEL_ROADMAP; keluar 1 bila ada cek gagal
pnpm eval:roadmap --models anthropic/claude-haiku-5.5,openai/gpt-6-luna
pnpm eval:prd                          # kasus klinik dengan MODEL_PRD; --models a,b; --save <folder>
pnpm eval:build                        # 2 fitur klinik dengan MODEL_SPEC/MODEL_TASKS; --features n; --prd <berkas>
pnpm eval:chat                         # 3 pesan chat revisi dengan MODEL_CHAT; --models a,b
pnpm eval:roadmap --codebase          # kasus berkonteks M7-19 (fitur baru untuk Piard + dokumentasinya)
pnpm eval:codebase --estimate-only     # perkiraan biaya analisis repo `app` tanpa memanggil model
pnpm eval:codebase                     # analisis repo `app` dengan MODEL_CODEBASE (±US$0,15, ±3 menit)
pnpm eval:codebase --dir <folder> --model <id> --save <folder>
```

Skrip tidak menulis ke database dan tidak mencetak kunci. Biaya satu putaran 3 ide pertanyaan dengan Haiku
sekitar US$0,003; satu run eval roadmap sekitar US$0,002. Cek eval ada di `evals/roadmap-checks.ts`
(dites di `tests/unit/roadmap-eval-checks.test.ts`). Cek eval PRD ada di `evals/prd-checks.ts` (dites di
`tests/unit/prd-eval-checks.test.ts`); satu run Nemotron gratis, Haiku ±US$0,003.
