# Fitur questions

Lima pertanyaan klarifikasi yang dibuat AI dari ide + preferensi teknologi (langkah 3 wizard).

**Alur:** halaman langkah 3 → bila belum ada pertanyaan, `GenerateQuestions` memanggil
`POST /api/plan/questions {planId}` → service membangun prompt → `getAi().generateStructured` →
`plans.saveQuestions` → halaman dimuat ulang → `QuestionStep` menampilkan satu pertanyaan per layar.

**Idempoten dan hemat biaya:** bila pertanyaan sudah ada, tidak ada panggilan AI. Permintaan yang
bersamaan untuk plan yang sama menumpang satu panggilan (`inflight` di `server/service.ts`).
`{regenerate: true}` membuat ulang dan menghapus jawaban lama (belum ada tombolnya di UI).

**Bentuk keluaran** (`ai/questions.schema.ts`): tepat 5 pertanyaan `{id, question, type, options, required}`;
`text` tanpa opsi; pilihan 3-6 opsi tanpa duplikat; id snake_case unik. Pola yang dituju: `real_user_pain`
(teks), `first_win`, `must_have_features` (multi), `main_advantage`, `come_back_reason`.

**Jawaban:** `answers[id]` string (teks/tunggal) atau string[] (multi). Pertanyaan **dilewati** = kunci
ada dengan nilai kosong (`""`/`[]`), beda dari belum dijawab (kunci tidak ada). "Lainnya" = nilai di luar opsi.
Pintasan: angka memilih opsi, Enter melanjutkan.

**Mengubah prompt:** `ai/questions.prompt.ts` (fungsi murni, dites di `tests/unit/questions-ai.test.ts`).
Mode `LLM_MODE=mock` memakai fixture tetap di `ai/questions.mock.ts`. Model default (`anthropic/claude-haiku-5.5`)
dan hasil uji ada di `docs/ai-pipeline.md`; uji ulang dengan `pnpm llm:check --questions`.
