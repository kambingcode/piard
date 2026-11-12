import { authedRoute } from "@/features/auth/server";
import { type BuildJobEvent, buildQuerySchema } from "@/features/specs";
import { getSpecsService } from "@/features/specs/server";
import { sseResponse } from "@/server/http/sse";

/** SSE event `job` (`phase`, `status`, `totalFeatures`, `doneFeatures`) untuk job plan. */
export const GET = authedRoute(
  { query: buildQuerySchema },
  async ({ user, query, request }) => {
    const service = getSpecsService();
    service.getBuild(user.id, query.planId); // 404 sebelum aliran dibuka
    return sseResponse<{ job: BuildJobEvent }>(request.signal, (stream) =>
      service.subscribe(user.id, query.planId, (event) => stream.send("job", event)),
    );
  },
);
