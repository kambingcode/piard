import type { PlanLanguage } from "@/features/plans";
import type { QuestionsOutput } from "./questions.schema";

const FIXTURES: Record<PlanLanguage, QuestionsOutput> = {
  id: {
    questions: [
      {
        id: "real_user_pain",
        type: "text",
        options: [],
        question:
          "Ceritakan seseorang yang butuh aplikasi ini. Sekarang mereka ngapain buat ngatasi masalahnya?",
        required: true,
      },
      {
        id: "first_win",
        type: "single_choice",
        options: [
          "Daftar akun",
          "Mencari yang dibutuhkan",
          "Membuat pesanan pertama",
          "Melihat ringkasan",
          "Mengatur preferensi",
        ],
        question:
          "Hal pertama yang harus bisa diselesaikan orang itu sebelum menutup aplikasi, apa?",
        required: true,
      },
      {
        id: "must_have_features",
        type: "multi_choice",
        options: [
          "Pencarian",
          "Pemesanan",
          "Pembayaran online",
          "Pengingat",
          "Dasbor admin",
        ],
        question: "Dari fitur-fitur ini, mana yang wajib ada? (pilih lebih dari satu)",
        required: true,
      },
      {
        id: "main_advantage",
        type: "single_choice",
        options: ["Lebih cepat", "Lebih gampang", "Lebih murah", "Bisa dari rumah"],
        question:
          "Apa hal utama yang bikin aplikasi ini lebih bagus dibanding cara mereka sekarang?",
        required: true,
      },
      {
        id: "come_back_reason",
        type: "single_choice",
        options: [
          "Riwayat tersimpan",
          "Ada pengingat",
          "Prosesnya cepat",
          "Ada penawaran khusus",
        ],
        question: "Apa yang bikin orang itu balik lagi, bukan cuma coba sekali?",
        required: true,
      },
    ],
  },
  en: {
    questions: [
      {
        id: "real_user_pain",
        type: "text",
        options: [],
        question:
          "Describe someone who needs this app. What do they do today to cope with the problem?",
        required: true,
      },
      {
        id: "first_win",
        type: "single_choice",
        options: [
          "Sign up",
          "Find what they need",
          "Place a first order",
          "See a summary",
          "Set preferences",
        ],
        question:
          "What is the first thing that person must be able to finish before closing the app?",
        required: true,
      },
      {
        id: "must_have_features",
        type: "multi_choice",
        options: ["Search", "Booking", "Online payment", "Reminders", "Admin dashboard"],
        question: "Which of these features are must-haves? (pick several)",
        required: true,
      },
      {
        id: "main_advantage",
        type: "single_choice",
        options: ["Faster", "Easier", "Cheaper", "Works from home"],
        question: "What makes this clearly better than what they use today?",
        required: true,
      },
      {
        id: "come_back_reason",
        type: "single_choice",
        options: ["Saved history", "Reminders", "Quick process", "Special offers"],
        question: "What makes them come back instead of trying it once?",
        required: true,
      },
    ],
  },
};

/** Fixture deterministik untuk `LLM_MODE=mock`; sama untuk ide apa pun (tidak membaca isi ide). */
export function mockQuestions(language: PlanLanguage): QuestionsOutput {
  return FIXTURES[language];
}
