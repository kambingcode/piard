import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema } from "@/features/codebase";
import { getAnalysisService } from "@/features/codebase/server";

/**
 * Perkiraan token dan biaya analisis dari sumber yang tersimpan → `{estimate}` (`costUsd` null bila
 * harga model belum diketahui; `needsConfirmation` + `reasons` bila melewati ambang).
 */
export const GET = authedRoute(
  { params: codebaseIdParamsSchema },
  async ({ user, params }) => ({
    estimate: getAnalysisService().estimate(user.id, params.id),
  }),
);
