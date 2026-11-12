import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema } from "@/features/codebase";
import { getAnalysisService, getCodebaseService } from "@/features/codebase/server";

/** "Batalkan": menghentikan analisis dan menghapus sumber sementara → `{codebase}`. */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema },
  async ({ user, params }) => {
    getAnalysisService().cancel(user.id, params.id);
    return { codebase: getCodebaseService().get(user.id, params.id) };
  },
);
