import { authedRoute } from "@/features/auth/server";
import { createCodebaseSchema } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";

/** Membuat proyek eksisting (tanpa sumber). Sumber kode dikirim terpisah sesuai jalurnya. */
export const POST = authedRoute(
  { body: createCodebaseSchema },
  async ({ user, body }) => ({
    codebase: getCodebaseService().create(user.id, body),
  }),
);
