import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema } from "@/features/codebase";
import { getAnalysisService, getCodebaseService } from "@/features/codebase/server";

/** "Coba lagi" analisis yang gagal; langkah yang sudah selesai tidak diulang → `{codebase}`. */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema },
  async ({ user, params }) => {
    getAnalysisService().retry(user.id, params.id);
    return { codebase: getCodebaseService().get(user.id, params.id) };
  },
);
