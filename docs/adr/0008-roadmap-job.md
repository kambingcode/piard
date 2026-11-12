# 0008 — Job roadmap: keluaran bersarang, simpan bertahap, ulang dari awal

**Status:** diterima (2026-10-29)

**Konteks.** Roadmap harus muncul bertahap (node bertambah selagi AI menulis, doc 08 bagian 6), bertahan
saat proses mati (doc 07 bagian 4), dan selesai di bawah 60 detik. Doc 07 bagian 8.2 merancang keluaran
datar `subFeatures[{parentName, ...}]`.

**Keputusan.**
- Sub-fitur ditulis **bersarang** di dalam fiturnya. Fitur ke-i pasti lengkap begitu fitur ke-(i+1) mulai
  ditulis, jadi bisa disimpan (dengan sub-fiturnya, satu transaksi) tanpa menunggu akhir; tidak ada
  `parentName` yang bisa salah ketik.
- `AiClient.streamStructured` (`streamText` + `Output.object`) mengirim objek parsial; handler menyimpan
  fitur yang lengkap, lalu di akhir memadatkan fase (1..n tanpa lompatan) dan mengurutkan posisi.
- Job **idempoten dengan mulai dari awal**: menghapus roadmap plan lalu menyusun ulang. Satu aliran LLM
  tidak bisa dilanjutkan dari tengah, jadi setelah restart job diulang penuh (biaya ±US$0,002).
- Selama job berjalan, edit fitur ditolak `409 CONFLICT` dan UI menonaktifkannya, agar tulisan pengguna
  tidak bertabrakan dengan penyimpanan job. "Buat ulang" mengganti seluruh roadmap dan selalu dikonfirmasi.
- Klien mengikuti job lewat **polling** `GET /api/plan/roadmap/generate` (1,5 detik), seperti situs acuan.
  SSE disimpan untuk M4 (banyak job paralel).
- Skema keluaran lebih longgar (3-10 fitur, 1-8 sub-fitur) daripada target prompt (5-8 dan 3-5) agar satu
  fitur kelebihan tidak membuang hasil yang sudah dibayar; target diperiksa `pnpm eval:roadmap`.

**Konsekuensi.** Kegagalan di tengah meninggalkan roadmap parsial yang tetap terlihat, dengan tombol
"Coba lagi" yang mengulang job. Roadmap yang dibuat ulang memakai id baru, jadi data yang menempel pada
id fitur (spesifikasi, task di M4) harus ikut dibuat ulang atau ditandai tidak sinkron (M5).
