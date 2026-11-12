/** Pengguna yang sedang masuk. Tidak pernah memuat hash kata sandi. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

/** Respons `GET /api/auth/status`. */
export type AuthStatus = {
  /** Pendaftaran hanya terbuka sampai akun pertama dibuat (aplikasi pengguna tunggal). */
  signUpOpen: boolean;
};
