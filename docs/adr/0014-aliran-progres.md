# 0014 — Progres ke klien: polling, SSE, atau NDJSON sesuai bentuk pekerjaannya

**Status:** diterima (2026-10-30). Merangkum keputusan yang tersebar di ADR 0008-0011.

**Konteks.** Pekerjaan AI berjalan sebagai job di proses yang sama ([ADR 0004](0004-job-in-process.md))
dan bisa makan 10 detik sampai beberapa menit. Klien harus melihat kemajuan, bertahan saat tab dimuat ulang,
dan tidak boleh menggandakan biaya bila koneksi putus.

**Keputusan.** Tidak ada satu mekanisme untuk semua; dipilih per bentuk pekerjaan:

| Pekerjaan | Mekanisme | Alasan |
|---|---|---|
| Roadmap, PRD, revisi PRD | **Polling** `GET` 1-1,5 detik ([0008](0008-roadmap-job.md), [0009](0009-prd-job.md)) | Satu job per plan; respons sama dengan situs acuan; hasil sementara (fitur yang sudah lengkap, draf PRD) ikut di respons. |
| Spesifikasi & task (banyak fitur) | **SSE** `/api/plan/generation/stream`, `/api/plan/tasks/stream`, event `job` ([0010](0010-build-job.md)) | Banyak langkah; klien memuat ulang fitur yang baru selesai saat `doneFeatures` naik. Browser menyambung ulang sendiri. |
| Chat revisi | **NDJSON** lewat `fetch` POST ([0011](0011-chat-revisi.md)) | Balasan terikat pada satu permintaan; event sedikit (`user`, `text`, `part`, `done`, `error`); tidak perlu protokol UI message stream. |

Semua mekanisme hanya **membaca** keadaan job di database; memulai job selalu `POST` terpisah yang
idempoten (dedupe job aktif yang sama), sehingga koneksi yang putus tidak memulai pekerjaan baru.

**Konsekuensi.** Tiga jalur klien (`apiRequest` + interval, `useEventSource`, `postStream`) harus
dirawat; ketiganya punya tes (unit `http-sse`, `ndjson`; e2e roadmap/PRD/tasks/revisi). Next dev server
menyangga SSE dengan baik, tetapi e2e memakai build produksi karena HMR mengganggu koneksi panjang.
