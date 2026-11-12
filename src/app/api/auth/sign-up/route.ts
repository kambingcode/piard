import { signUpSchema } from "@/features/auth";
import { signUpFlow } from "@/features/auth/server";
import { publicRoute } from "@/server/http/route";

/** Membuat akun pemilik (hanya akun pertama) dan langsung masuk. */
export const POST = publicRoute({ body: signUpSchema }, ({ request, body }) =>
  signUpFlow(request, body),
);
