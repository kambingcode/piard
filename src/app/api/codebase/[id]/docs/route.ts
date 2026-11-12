import { authedRoute } from "@/features/auth/server";
import {
  codebaseIdParamsSchema,
  docsQuerySchema,
  saveDocSchema,
} from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";

/** Tanpa `slug`: `{pages}` (versi terbaru tiap halaman, tanpa isi). Dengan `slug`: `{page, versions, proposal}`. */
export const GET = authedRoute(
  { params: codebaseIdParamsSchema, query: docsQuerySchema },
  async ({ user, params: { id }, query }) =>
    query.slug === undefined
      ? { pages: getCodebaseService().listDocs(user.id, id) }
      : getCodebaseService().getDoc(user.id, id, query.slug, query.version),
);

/** Edit manual satu halaman → versi baru `origin = manual` → `{page, versions, proposal}` (409 saat analisis). */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema, body: saveDocSchema },
  async ({ user, params: { id }, body }) =>
    getCodebaseService().saveDoc(user.id, id, body.slug, body.content),
);
