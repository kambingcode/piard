import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";

/** Unduh seluruh dokumentasi: `<slug-nama>-docs.zip` berisi `NN-<slug>.md` per halaman. */
export const GET = authedRoute(
  { params: codebaseIdParamsSchema },
  async ({ user, params }) => {
    const file = getCodebaseService().exportDocs(user.id, params.id);
    return new Response(file.body, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${file.filename}"`,
        "cache-control": "no-store",
      },
    });
  },
);
