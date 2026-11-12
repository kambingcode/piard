import { authedRoute } from "@/features/auth/server";

/** Pengguna sesi ini → `{user}`. */
export const GET = authedRoute({}, async ({ user }) => ({ user }));
