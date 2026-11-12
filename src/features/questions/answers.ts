import type { AnswerValue, ClarifyingQuestion } from "@/features/plans";

export type Answers = Record<string, AnswerValue>;

/** Nilai yang disimpan saat pertanyaan dilewati: kosong, tetapi kuncinya ada (beda dari belum dijawab). */
export function skippedValue(question: ClarifyingQuestion): AnswerValue {
  return question.type === "multi_choice" ? [] : "";
}

/** Pertanyaan dianggap ditangani bila dijawab atau dilewati (kuncinya ada di jawaban). */
export function isHandled(question: ClarifyingQuestion, answers: Answers): boolean {
  return question.id in answers;
}

/** Jawaban yang bermakna: teks tidak kosong, atau minimal satu pilihan. Dasar tombol "Lanjut". */
export function hasAnswer(question: ClarifyingQuestion, answers: Answers): boolean {
  const value = answers[question.id];
  if (value === undefined) return false;
  return Array.isArray(value) ? value.some((v) => v.trim() !== "") : value.trim() !== "";
}

/** Indeks tempat melanjutkan: pertanyaan pertama yang belum ditangani, atau yang terakhir bila semua sudah. */
export function resumeIndex(questions: ClarifyingQuestion[], answers: Answers): number {
  const firstOpen = questions.findIndex((question) => !isHandled(question, answers));
  return firstOpen === -1 ? Math.max(0, questions.length - 1) : firstOpen;
}

/** Isian "Lainnya" untuk pilihan tunggal: jawaban yang bukan salah satu opsi. */
export function singleOtherText(question: ClarifyingQuestion, answers: Answers): string {
  const value = answers[question.id];
  return typeof value === "string" && value !== "" && !question.options.includes(value)
    ? value
    : "";
}

/** Isian "Lainnya" untuk banyak pilihan: entri pertama yang bukan salah satu opsi. */
export function multiOtherText(question: ClarifyingQuestion, answers: Answers): string {
  const value = answers[question.id];
  return Array.isArray(value)
    ? (value.find((v) => !question.options.includes(v)) ?? "")
    : "";
}

/** Mengganti isian "Lainnya" pada banyak pilihan tanpa mengubah opsi yang dicentang. */
export function withMultiOther(
  question: ClarifyingQuestion,
  answers: Answers,
  text: string,
): string[] {
  const value = answers[question.id];
  const picked = Array.isArray(value)
    ? value.filter((v) => question.options.includes(v))
    : [];
  return text.trim() === "" ? picked : [...picked, text];
}

export function toggleOption(current: AnswerValue | undefined, option: string): string[] {
  const list = Array.isArray(current) ? current : [];
  return list.includes(option) ? list.filter((v) => v !== option) : [...list, option];
}
