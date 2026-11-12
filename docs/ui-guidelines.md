# Panduan UI

Turunan catatan riset UI (lokal, tidak di repo) dan aturan layar aplikasi skill `design-taste-frontend`.
Arah: netral dan tenang (gaya Sana), pil hitam sebagai aksi utama, aksen indigo hemat.

## Token

Didefinisikan sekali di `src/styles/globals.css` memakai `light-dark(terang, gelap)`; komponen hanya
memakai kelas token (`bg-card`, `text-muted-foreground`), **tidak pernah hex langsung**.

| Token | Terang | Gelap | Dipakai untuk |
|---|---|---|---|
| background / card | #FAFAF8 / #FFFFFF | #0E0E10 / #17171A | ground / permukaan |
| foreground | #0B0B0C | #F4F4F2 | teks utama |
| muted-foreground | #66666A | #A1A1A8 | teks sekunder (≥ 4.5:1 di semua permukaan) |
| border / control-border | #E6E4E0 / #CFCDC8 | #26262B / #3A3A41 | pemisah / batas kontrol |
| primary | #0B0B0C | #F4F4F2 | tombol utama (pil), ikon aktif |
| accent | #4A2BDB | #A99CFF | fokus, tautan, progres. **Bukan** chrome |
| positive / negative / warning | hijau / merah / ambar | versi lebih terang | status, selalu bersama teks atau ikon |

Radius: kartu 20px, kontrol 14px, chip 8px, tombol utama pil penuh. Tanpa bayangan pada elemen yang diam;
bayangan hanya untuk yang melayang (menu, dialog). Bagian halaman bisa dipaksa tema dengan atribut
`data-theme="light|dark"` (dipakai `/dev/components`). `tests/unit/design-tokens.test.ts` menjaga kontras
AA untuk 22 pasangan teks di kedua tema.

**Catatan teknis:** browser menghitung `light-dark()` di elemen tempat variabel dideklarasikan, jadi token
dideklarasikan pada `:root, [data-theme]`.

## Tipografi

Geist Sans (paket `geist`, tanpa jaringan saat build) dan Geist Mono. Judul halaman 28–32px/600 dengan
tracking −0,02em; isi 14–16px; label 12–14px. Satu `h1` per halaman, tidak lebih besar dari 32px.
Angka yang rata kolom memakai `.tabular`.

## Pola komponen (`src/components/patterns`)

| Pola | Kegunaan |
|---|---|
| `StepList` | progres job: langkah menunggu/berjalan/selesai/gagal; langkah selesai di awal dilipat |
| `EmptyState` | bingkai putus-putus dengan judul, penjelasan, dan satu aksi berikutnya |
| `ConfirmUndo` (`showUndoToast`) | aksi ditunda 8 detik dengan toast "Urungkan" |
| `StreamingText` | teks mengalir dengan kursor; pembaca layar hanya diberi pengumuman selesai |

Contoh semua pola di tema terang dan gelap: halaman `/dev/components` (perlu login).

## Kriteria (berlaku untuk semua layar)

- Satu aksi utama per layar; label tombol berupa kata kerja (Buat, Simpan, Ekspor).
- Target sentuh ≥ 44px di ponsel; fokus selalu terlihat; ikon tombol punya nama aksesibel.
- Warna tidak pernah satu-satunya penanda (selalu ada teks atau ikon).
- Kolom isian: label di atas, galat tepat di bawah kolom dan dihubungkan `aria-describedby`.
- State kosong menjelaskan langkah berikutnya; nol dicetak sebagai nol.
- Hormati `prefers-reduced-motion`; teks UI Bahasa Indonesia di `copy.ts` fitur.
- Ponsel: rail dan sidebar menjadi bilah atas 48px dengan menu lembar; tanpa gulir horizontal.
- Tab plan (Struktur, PRD, Spesifikasi & task, Kanban, Pemakaian) memakai `PlanFrame` (lebar 1200px, bilah tab
  + judul di posisi tetap); view tab tidak menambah `max-w` atau `h1` sendiri. Teks panjang dibatasi `75ch`.

## Pintasan dan navigasi cepat

- **Command palette** (Ctrl/⌘ K, atau tombol "Cari dan perintah" di sidebar, rail, dan bilah atas ponsel):
  plan baru, semua plan, pengaturan, lompat ke plan, bagian plan yang sedang dibuka, dan ekspor. Milik fitur
  plans; shell hanya memancarkan event `piard:open-palette` (`components/layout/palette-event.ts`).
- Ctrl/⌘ Enter mengirim ide dan menyimpan editor (PRD, task); Esc menutup editor dan panel; angka 1-9
  memilih jawaban pertanyaan.
- Aksi baris sekunder (ubah, hapus task) berupa tombol ikon dengan `aria-label` lengkap dan tooltip; aksi
  utama baris tetap berlabel.
- Hapus selalu lewat `showUndoToast` (plan, fitur, sub-fitur, task); progres job selalu punya "Batalkan".

## Memuat

Tidak ada `loading.tsx` di area masuk: loading boundary membuat Next mengirim respons secara streaming, sehingga
`notFound()` menjawab 200, bukan 404 (ditangkap e2e "plan asing 404"). Halaman dirender dari SQLite dalam
milidetik; muatan yang lambat (job AI) punya progres sendiri.

## Pemeriksaan otomatis

- `tests/e2e/pages.a11y.spec.ts` (project Playwright `a11y`): axe WCAG 2.1 A/AA di sembilan layar, tema
  terang dan gelap, ditambah palette terbuka, editor task, dan diff PRD.
- Tangkapan layar empat lebar (375/768/1280/1920) × dua tema:
  `UX_SCREENSHOTS=<folder> pnpm e2e`.

