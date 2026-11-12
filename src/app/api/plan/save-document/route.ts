import { authedRoute } from "@/features/auth/server";
import { saveDocumentSchema } from "@/features/prd";
import { getPrdService } from "@/features/prd/server";

/** Menyimpan hasil edit PRD → `{document}` (versi baru, kecuali isinya sama dengan versi terbaru). */
export const POST = authedRoute({ body: saveDocumentSchema }, async ({ user, body }) => ({
  document: getPrdService().saveDocument(user.id, body.planId, body.content),
}));
