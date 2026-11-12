import { authedRoute } from "@/features/auth/server";
import { restoreDocumentSchema } from "@/features/prd";
import { getPrdService } from "@/features/prd/server";

/** Memulihkan versi lama sebagai versi terbaru → `{document}`. */
export const POST = authedRoute(
  { body: restoreDocumentSchema },
  async ({ user, body }) => ({
    document: getPrdService().restoreVersion(user.id, body.planId, body.version),
  }),
);
