# 0013 — Pengaturan AI di database menimpa `.env`, dibaca setiap panggilan

**Status:** diterima (2026-10-30)

**Konteks.** M6-02: halaman `/settings` mengubah model default per tugas dan batas biaya, dan perubahan
model harus berlaku pada panggilan berikutnya. Sebelumnya semuanya dari `.env`, dibaca sekali saat boot.
Kunci API tetap di `.env` dan tidak boleh tampil di UI (CLAUDE.md).

**Keputusan.**
- Tabel `app_settings` (satu baris, kunci `ai`) menyimpan **hanya nilai yang berbeda dari `.env`**
  (`AiSettingsOverrides`). Nilai yang tidak diubah tetap mengikuti `.env`, dan "Pakai nilai .env"
  menghapus baris itu. Global, karena pendaftaran hanya terbuka untuk pengguna pertama.
- `src/server/settings` (`getAiSettings()`) menggabungkan `.env` + baris itu. Klien AI menerima
  `modelFor(task)` dan penjaga biaya menerima `limits()`; keduanya memanggil `getAiSettings()` setiap
  kali, jadi tidak ada yang perlu dimulai ulang.
- **Tanpa cache memori.** Build produksi Next memuat modul server lebih dari sekali (route handler,
  halaman, runner job dari `instrumentation.ts`); cache per salinan modul basi setelah salinan lain
  menulis. Bug ini ditemukan e2e. Biayanya satu SELECT per primary key per panggilan model.
- Kunci hanya dilaporkan sebagai terisi/tidak (`Env.keysSet`). `Env.llm.apiKeys` kini membawa semua
  kunci yang diisi (bukan hanya yang dipakai model `.env`), agar model yang diganti bisa memakai penyedia
  lain. Di `LLM_MODE=openrouter`, model yang penyedianya tidak punya kunci ditolak saat disimpan.

**Konsekuensi.** Mengganti `MODEL_*` di `.env` tidak berpengaruh untuk tugas yang modelnya diubah di
`/settings` sampai pengaturan itu dikembalikan; halaman menandai kolom tersebut "Diubah di sini" dan
menampilkan nilai `.env` di bawahnya. `LLM_MODE` dan kunci tetap hanya dari `.env`.
