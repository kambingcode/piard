import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema, restoreDocSchema } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";

/** Memulihkan versi lama (disalin menjadi versi terbaru `origin = manual`) → `{page, versions, proposal}`. */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema, body: restoreDocSchema },
  async ({ user, params: { id }, body }) =>
    getCodebaseService().restoreDoc(user.id, id, body.slug, body.version),
);
