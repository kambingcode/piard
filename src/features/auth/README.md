# Fitur auth

Email + kata sandi untuk pemilik tunggal. Pendaftaran terbuka hanya sampai akun pertama ada.

**Alur:** form → `POST /api/auth/sign-up|sign-in` → service (hash scrypt, sesi) → cookie `piard_session`
(`HttpOnly`, `SameSite=Lax`). Area masuk: `(app)/layout.tsx` memanggil `requireUser()`.

**Data:** `users`, `sessions` (id = SHA-256 token; token mentah hanya ada di cookie).

**Endpoint:** `GET /api/auth/status` (apakah daftar masih terbuka) · `POST /api/auth/sign-up` ·
`POST /api/auth/sign-in` · `POST /api/auth/sign-out` · `GET /api/auth/me`.

**Pintu:** `index.ts` (skema, tipe, teks, form) · `server.ts` (`authedRoute`, `getCurrentUser`,
`requireUser`, `signUpFlow`, …). Rute baru yang butuh login: `authedRoute({ body }, ({ user }) => …)`.

**Mengubah teks:** `copy.ts`. **Batas percobaan gagal / masa sesi:** konstanta di `server/service.ts`,
`SESSION_TTL_DAYS` di `.env`. Keputusan: [ADR 0007](../../../docs/adr/0007-auth-sendiri.md).
