# 0003 — OpenRouter lewat satu lapisan AI

**Status:** diterima (2026-10-24)

**Konteks.** Model terbaik per tugas berbeda dan berubah cepat; biaya harus terlihat.

**Keputusan.** Satu kunci OpenRouter, model per tugas dari `.env` (`MODEL_*`). Semua panggilan lewat
`server/ai` (`generateStructured`, `streamText`) yang memilih model, memetakan galat ke `UPSTREAM_AI`, dan
mencatat token + biaya (dari `providerMetadata.openrouter.usage.cost`) ke tabel `usage`. `LLM_MODE=mock`
mengembalikan fixture deterministik tanpa jaringan untuk dev, tes, dan e2e. Mode `openrouter` gagal
mulai bila kunci atau model kosong; tidak ada model bawaan karena belum diuji (dipilih di M1-08).

**Konsekuensi.** Prompt dan skema keluaran hidup di fitur; infrastruktur tidak tahu isinya. Kegagalan
pencatatan biaya tidak menggagalkan hasil AI. Batas biaya (M6-01) bisa dipasang di satu tempat.
