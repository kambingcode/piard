import type { PlanLanguage } from "@/features/plans";
import type { RoadmapOutput } from "./roadmap.schema";

type Fixture = Omit<RoadmapOutput, "title">;

const sub = (name: string, summary: string, icon: string) => ({ name, summary, icon });

const FIXTURES: Record<PlanLanguage, Fixture> = {
  id: {
    features: [
      {
        name: "Pencarian Layanan",
        summary: "Membantu pengguna menemukan layanan yang tepat dengan cepat.",
        icon: "search",
        phase: 1,
        subFeatures: [
          sub("Cari Layanan", "Pengguna mencari berdasarkan kata kunci.", "search"),
          sub("Filter Lokasi", "Menyaring hasil sesuai lokasi terdekat.", "map"),
          sub("Detail Layanan", "Menampilkan informasi lengkap layanan.", "file"),
          sub("Simpan Favorit", "Menyimpan layanan untuk dibuka lagi.", "star"),
        ],
      },
      {
        name: "Pemesanan",
        summary: "Memungkinkan pengguna memesan tanpa perlu menelepon.",
        icon: "calendar",
        phase: 1,
        subFeatures: [
          sub("Pilih Jadwal", "Pengguna memilih waktu yang tersedia.", "calendar"),
          sub("Konfirmasi Pesanan", "Ringkasan pesanan sebelum dikirim.", "list"),
          sub("Riwayat Pesanan", "Daftar pesanan yang pernah dibuat.", "clock"),
        ],
      },
      {
        name: "Pembayaran Online",
        summary: "Memudahkan pengguna membayar langsung dari aplikasi.",
        icon: "payment",
        phase: 2,
        subFeatures: [
          sub("Pilih Metode Bayar", "QRIS, transfer, atau e-wallet.", "wallet"),
          sub("Bayar Pesanan", "Menyelesaikan pembayaran dalam satu layar.", "payment"),
          sub("Bukti Bayar", "Kuitansi tersimpan otomatis.", "file"),
        ],
      },
      {
        name: "Pengingat & Notifikasi",
        summary: "Mengingatkan pengguna sebelum jadwalnya tiba.",
        icon: "bell",
        phase: 2,
        subFeatures: [
          sub("Pengingat WhatsApp", "Pesan pengingat sehari sebelumnya.", "phone"),
          sub("Notifikasi Email", "Konfirmasi dan perubahan lewat email.", "mail"),
          sub("Atur Pengingat", "Pengguna memilih kapan diingatkan.", "settings"),
        ],
      },
      {
        name: "Dasbor Pengelola",
        summary: "Membantu pengelola mengatur jadwal dan melihat pesanan.",
        icon: "dashboard",
        phase: 3,
        subFeatures: [
          sub("Atur Jadwal", "Pengelola membuka dan menutup slot.", "calendar"),
          sub("Daftar Pesanan", "Semua pesanan masuk dalam satu tempat.", "list"),
          sub("Laporan Bulanan", "Ringkasan pesanan dan pendapatan.", "chart"),
          sub("Kelola Layanan", "Menambah dan mengubah layanan.", "settings"),
        ],
      },
      {
        name: "Akun & Masuk",
        summary: "Memungkinkan pengguna menyimpan data dan riwayatnya.",
        icon: "lock",
        phase: 3,
        subFeatures: [
          sub("Daftar Akun", "Membuat akun dengan email atau nomor HP.", "users"),
          sub("Masuk", "Masuk kembali dengan aman.", "lock"),
          sub("Profil", "Mengubah data diri.", "users"),
        ],
      },
      {
        name: "Ulasan Pengguna",
        summary: "Membantu pengguna lain memilih lewat pengalaman nyata.",
        icon: "chat",
        phase: 4,
        subFeatures: [
          sub("Beri Ulasan", "Menulis ulasan setelah layanan selesai.", "chat"),
          sub("Rating Bintang", "Memberi nilai 1 sampai 5.", "star"),
          sub("Lihat Ulasan", "Membaca ulasan pengguna lain.", "list"),
        ],
      },
    ],
  },
  en: {
    features: [
      {
        name: "Service Search",
        summary: "Helps people find the right service quickly.",
        icon: "search",
        phase: 1,
        subFeatures: [
          sub("Search Services", "Search by keyword.", "search"),
          sub("Location Filter", "Narrow results to nearby places.", "map"),
          sub("Service Details", "Show everything about a service.", "file"),
        ],
      },
      {
        name: "Booking",
        summary: "Lets people book without making a phone call.",
        icon: "calendar",
        phase: 1,
        subFeatures: [
          sub("Pick a Slot", "Choose an available time.", "calendar"),
          sub("Confirm Booking", "Review before sending.", "list"),
          sub("Booking History", "See past bookings.", "clock"),
        ],
      },
      {
        name: "Online Payment",
        summary: "Lets people pay right inside the app.",
        icon: "payment",
        phase: 2,
        subFeatures: [
          sub("Payment Methods", "Card, transfer, or e-wallet.", "wallet"),
          sub("Pay Booking", "Finish payment on one screen.", "payment"),
          sub("Receipts", "Receipts are saved automatically.", "file"),
        ],
      },
      {
        name: "Reminders",
        summary: "Reminds people before their appointment.",
        icon: "bell",
        phase: 2,
        subFeatures: [
          sub("WhatsApp Reminder", "A reminder one day before.", "phone"),
          sub("Email Updates", "Confirmations and changes by email.", "mail"),
          sub("Reminder Settings", "Choose when to be reminded.", "settings"),
        ],
      },
      {
        name: "Manager Dashboard",
        summary: "Helps managers run schedules and see bookings.",
        icon: "dashboard",
        phase: 3,
        subFeatures: [
          sub("Manage Schedule", "Open and close slots.", "calendar"),
          sub("Booking List", "All bookings in one place.", "list"),
          sub("Monthly Report", "Bookings and revenue summary.", "chart"),
        ],
      },
    ],
  },
};

/** Fixture deterministik untuk `LLM_MODE=mock`; sama untuk ide apa pun selain judulnya. */
export function mockRoadmap(language: PlanLanguage, title: string): RoadmapOutput {
  return { title, ...FIXTURES[language] };
}

/** Potongan parsial seperti model sungguhan: fitur bertambah satu per satu. */
export function mockRoadmapPartials(data: RoadmapOutput): Partial<RoadmapOutput>[] {
  return data.features.map((_, index) => ({
    title: data.title,
    features: data.features.slice(0, index + 1),
  }));
}
