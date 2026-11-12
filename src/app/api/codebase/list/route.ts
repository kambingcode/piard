import { authedRoute } from "@/features/auth/server";
import { getCodebaseService } from "@/features/codebase/server";

/** Proyek eksisting milik pengguna, yang terakhir diubah paling atas. */
export const GET = authedRoute({}, async ({ user }) => ({
  codebases: getCodebaseService().list(user.id),
}));
