import { getAuthStatus } from "@/features/auth/server";
import { publicRoute } from "@/server/http/route";

/** Dipakai halaman masuk untuk tahu apakah tautan "Buat akun" masih relevan. */
export const GET = publicRoute({}, async () => getAuthStatus());
