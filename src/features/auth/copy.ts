/** Semua teks UI dan pesan galat fitur auth (Bahasa Indonesia, satu kata kerja per aksi). */
export const authCopy = {
  signIn: {
    title: "Masuk ke Piard",
    subtitle: "Lanjutkan rencana yang sedang Anda susun.",
    submit: "Masuk",
    submitting: "Memeriksa…",
    switchPrompt: "Belum punya akun?",
    switchAction: "Buat akun",
  },
  signUp: {
    title: "Buat akun Piard",
    subtitle: "Akun pertama menjadi pemilik aplikasi ini.",
    submit: "Buat akun",
    submitting: "Membuat akun…",
    switchPrompt: "Sudah punya akun?",
    switchAction: "Masuk",
    closedTitle: "Pendaftaran ditutup",
    closedBody: "Piard dipakai satu orang dan akunnya sudah dibuat. Silakan masuk.",
  },
  signOut: "Keluar",
  fields: {
    name: "Nama",
    email: "Email",
    password: "Kata sandi",
  },
  errors: {
    invalidEmail: "Format email belum benar.",
    nameRequired: "Nama wajib diisi.",
    passwordRequired: "Kata sandi wajib diisi.",
    passwordTooShort: (min: number) => `Kata sandi minimal ${min} karakter.`,
    wrongCredentials: "Email atau kata sandi salah.",
    signUpClosed:
      "Pendaftaran sudah ditutup karena akun pemilik sudah dibuat. Silakan masuk.",
    notSignedIn: "Sesi berakhir. Silakan masuk lagi.",
    tooManyAttempts: (minutes: number) =>
      `Terlalu banyak percobaan masuk. Coba lagi dalam ${minutes} menit.`,
    generic: "Terjadi kesalahan. Coba lagi sebentar lagi.",
  },
} as const;
