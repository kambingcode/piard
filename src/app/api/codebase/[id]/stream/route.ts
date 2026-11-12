import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema } from "@/features/codebase";
import { type AnalysisStatus, getAnalysisService } from "@/features/codebase/server";
import { sseResponse } from "@/server/http/sse";

/** SSE event `status` (bentuk sama dengan `GET .../status`): segera saat tersambung, lalu tiap perubahan. */
export const GET = authedRoute(
  { params: codebaseIdParamsSchema },
  async ({ user, params, request }) => {
    const service = getAnalysisService();
    service.status(user.id, params.id); // 404 sebelum aliran dibuka
    return sseResponse<{ status: AnalysisStatus }>(request.signal, (stream) =>
      service.subscribe(user.id, params.id, (status) => stream.send("status", status)),
    );
  },
);
