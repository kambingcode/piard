/**
 * Nama ikon fitur yang dikenal Piard. AI diminta memilih dari daftar ini; nilai lain (atau kosong)
 * diganti ikon yang ditebak dari kata kunci nama fitur (doc 04: "ikon fallback dari kata kunci").
 */
export const ROADMAP_ICONS = [
  "calendar",
  "payment",
  "bell",
  "dashboard",
  "settings",
  "lock",
  "chat",
  "users",
  "search",
  "cart",
  "chart",
  "file",
  "map",
  "star",
  "home",
  "mail",
  "camera",
  "book",
  "heart",
  "clock",
  "shield",
  "truck",
  "wallet",
  "gift",
  "list",
  "upload",
  "globe",
  "phone",
  "sparkles",
] as const;
export type RoadmapIcon = (typeof ROADMAP_ICONS)[number];

export const DEFAULT_ICON: RoadmapIcon = "sparkles";

const KNOWN = new Set<string>(ROADMAP_ICONS);

/** Kata kunci (id + en) per ikon; urutan penting karena yang pertama cocok menang. */
const KEYWORDS: [RoadmapIcon, RegExp][] = [
  ["payment", /bayar|pembayaran|payment|checkout|tagihan|invoice|billing|qris/],
  ["bell", /notif|pengingat|ingat|remind|alert/],
  ["calendar", /jadwal|booking|reservasi|janji|schedule|calendar|kalender|appointment/],
  ["dashboard", /dasbor|dashboard|ringkasan|overview/],
  ["lock", /akun|login|masuk|daftar|auth|sign|password|sandi/],
  ["chat", /chat|ulasan|review|komentar|pesan|message|feedback|diskusi/],
  ["chart", /laporan|report|analit|statistik|metrik|insight/],
  ["search", /cari|pencarian|search|temukan|find|filter/],
  ["cart", /keranjang|cart|pesanan|order|belanja|toko|shop/],
  ["users", /pengguna|user|pasien|pelanggan|customer|tim|team|anggota|member|profil/],
  ["settings", /admin|pengaturan|setting|kelola|manage|konfigurasi/],
  ["truck", /kirim|antar|delivery|shipping|kurir|logistik/],
  ["map", /lokasi|peta|map|cabang|alamat|location/],
  ["file", /dokumen|file|berkas|resep|rekam|catatan|note/],
  ["book", /kursus|belajar|materi|course|lesson|kelas/],
  ["wallet", /dompet|saldo|wallet|keuangan|pengeluaran|budget|anggaran/],
  ["star", /rating|favorit|favorite|bintang/],
  ["upload", /unggah|upload|impor|import/],
];

/**
 * Ikon yang dipakai untuk menampilkan fitur: nilai dari AI bila dikenal, selain itu tebakan dari
 * nama, selain itu {@link DEFAULT_ICON}. Fungsi murni.
 */
export function resolveIcon(icon: string | null | undefined, name: string): RoadmapIcon {
  if (icon && KNOWN.has(icon)) return icon as RoadmapIcon; // diperiksa oleh `KNOWN`
  const lower = name.toLowerCase();
  return KEYWORDS.find(([, pattern]) => pattern.test(lower))?.[0] ?? DEFAULT_ICON;
}
