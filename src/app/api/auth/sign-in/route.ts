import { signInSchema } from "@/features/auth";
import { signInFlow } from "@/features/auth/server";
import { publicRoute } from "@/server/http/route";

/**
 * Masuk → `{user}` dan cookie sesi. Email/kata sandi salah dan terlalu banyak percobaan gagal sama-sama
 * 401 dengan pesan yang sama.
 */
export const POST = publicRoute({ body: signInSchema }, ({ request, body }) =>
  signInFlow(request, body),
);
