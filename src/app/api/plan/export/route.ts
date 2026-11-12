import { authedRoute } from "@/features/auth/server";
import { exportQuerySchema } from "@/features/export";
import { getExportService } from "@/features/export/server";

/**
 * Unduh: `?planId=&format=md[&version=n]` → `<slug>-PRD.md` (versi lama `-v<n>`);
 * `format=zip` → `<slug>.zip` berisi `PRD.md` dan `features/NN-<slug>.md`.
 */
export const GET = authedRoute({ query: exportQuerySchema }, async ({ user, query }) => {
  const service = getExportService();
  const file =
    query.format === "zip"
      ? service.zip(user.id, query.planId)
      : service.markdown(user.id, query.planId, query.version);
  return new Response(file.body, {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store",
    },
  });
});
