import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema, startAnalysisSchema } from "@/features/codebase";
import { getAnalysisService, getCodebaseService } from "@/features/codebase/server";

/**
 * Memulai analisis server (job `codebase-analyze`) → `{started: true, codebase}`, atau
 * `{started: false, estimate}` bila perkiraan biaya butuh konfirmasi dan `confirmed` belum true.
 */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema, body: startAnalysisSchema },
  async ({ user, params: { id }, body }) => {
    const result = getAnalysisService().start(user.id, id, body);
    return result.started
      ? { started: true, codebase: getCodebaseService().get(user.id, id) }
      : result;
  },
);
