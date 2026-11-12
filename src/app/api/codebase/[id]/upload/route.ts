import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";
import { readBodyLimited } from "@/server/http/body";

/**
 * Upload ZIP proyek (badan = byte arsip mentah, bukan multipart; nama berkas di header `x-file-name`,
 * di-encode URI) → `{codebase}` berstatus `source_ready`. Batas dari `CODEBASE_MAX_UPLOAD_MB` (413).
 */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema },
  async ({ user, params: { id }, request }) => {
    const service = getCodebaseService();
    // Kepemilikan dicek sebelum badan dibaca agar orang lain tidak bisa membuat server membaca 50 MB.
    service.own(user.id, id);
    const limit = service.uploadLimit();
    const bytes = await readBodyLimited(request, limit.bytes, limit.messages);
    return {
      codebase: service.receiveZip(
        user.id,
        id,
        bytes,
        request.headers.get("x-file-name"),
      ),
    };
  },
);
