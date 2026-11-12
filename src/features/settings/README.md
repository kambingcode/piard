# Fitur settings

Halaman `/settings` (menu "Pengaturan"): model AI per tugas, batas biaya, dan status kunci API
(doc 07 R16, kartu M6-02). Pengaturan global karena aplikasi hanya punya satu pemilik.

- **API:** `GET /api/settings` → `SettingsView`; `PUT` dengan `updateSettingsSchema` (semua model +
  `budget.{dailyUsd,monthlyUsd}`, `null` = tanpa batas) → `SettingsView`; `DELETE` → kembali ke `.env`.
- **Penyimpanan:** tabel `app_settings` (kunci `ai`) lewat `src/server/settings`. Hanya nilai yang berbeda
  dari `.env` yang disimpan, jadi `.env` tetap berlaku untuk yang tidak diubah. `getAiSettings()` dibaca di
  setiap panggilan model (`modelFor`) dan setiap cek batas, sehingga perubahan berlaku pada panggilan
  berikutnya tanpa mulai ulang. Sengaja tanpa cache memori: Next memuat modul server lebih dari sekali
  (route, halaman, runner job), sehingga cache per salinan bisa basi (ditemukan e2e).
- **Kunci:** hanya status "Terisi/Belum diisi" (`Env.keysSet`); nilainya tidak pernah keluar dari server.
  Di `LLM_MODE=openrouter`, model yang penyedianya tidak punya kunci ditolak (`VALIDATION` per kolom).
- **Tes:** `tests/integration/settings-service.test.ts`, `tests/integration/settings-api.test.ts`.
