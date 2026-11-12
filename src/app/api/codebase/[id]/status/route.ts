import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema } from "@/features/codebase";
import { getAnalysisService } from "@/features/codebase/server";

/** Status analisis → `{status, error, job: {id, state, phase, done, total} | null}`. */
export const GET = authedRoute(
  { params: codebaseIdParamsSchema },
  async ({ user, params }) => getAnalysisService().status(user.id, params.id),
);
