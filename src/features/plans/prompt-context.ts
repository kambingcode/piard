import { AI_CHOICE, type Plan, type PlanLanguage, TECH_AREAS } from "./schemas";

/** Nama bahasa keluaran untuk instruksi prompt, sesuai `plan.language`. */
export const PROMPT_LANGUAGE: Record<PlanLanguage, string> = {
  id: "Bahasa Indonesia (santai tapi jelas)",
  en: "English (plain and friendly)",
};

/** Teknologi yang dipilih sendiri oleh pengguna (`area: nilai`); pilihan "AI pilih" tidak disebut. */
export function chosenTech(techStack: Plan["techStack"]): string[] {
  return TECH_AREAS.flatMap((area) => {
    const value = techStack[area];
    return value && value !== AI_CHOICE ? [`${area}: ${value}`] : [];
  });
}

/** Pasangan pertanyaan-jawaban yang benar-benar dijawab; yang dilewati tidak disebut. */
export function answeredQuestions(qa: Plan["questionAnswers"]): string[] {
  return qa.questions.flatMap((q) => {
    const value = qa.answers[q.id];
    const answer = Array.isArray(value) ? value.join(", ") : (value ?? "");
    return answer.trim() === "" ? [] : [`- ${q.question}\n  Jawaban: ${answer.trim()}`];
  });
}
