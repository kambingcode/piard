import { signOutFlow } from "@/features/auth/server";
import { publicRoute } from "@/server/http/route";

/** Keluar: sesi dihapus dan cookie dikosongkan → 204. Tanpa sesi pun berhasil. */
export const POST = publicRoute({}, async ({ request }) => signOutFlow(request));
