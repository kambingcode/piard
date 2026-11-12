import { type BoardEvent, subscribeBoard } from "@/features/agent-bridge/server";
import { authedRoute } from "@/features/auth/server";
import { type BuildJobEvent, buildQuerySchema } from "@/features/specs";
import { getSpecsService } from "@/features/specs/server";
import { sseResponse } from "@/server/http/sse";

type TaskEvent = Pick<BuildJobEvent, "jobId" | "status" | "featureId" | "doneFeatures">;
type AgentEvent = Pick<BoardEvent, "taskId" | "status" | "reason">;

/**
 * SSE event `task`: task plan berubah oleh job (klien memuat ulang daftar task). Event `agent`: card
 * berubah oleh agen atau tinjauan (M8-11; `{taskId, status, reason}`).
 */
export const GET = authedRoute(
  { query: buildQuerySchema },
  async ({ user, query, request }) => {
    const service = getSpecsService();
    // Memeriksa kepemilikan plan (melempar NOT_FOUND) sebelum berlangganan apa pun.
    service.getBuild(user.id, query.planId);
    return sseResponse<{ task: TaskEvent; agent: AgentEvent }>(
      request.signal,
      (stream) => {
        const stopJobs = service.subscribe(
          user.id,
          query.planId,
          ({ jobId, status, featureId, doneFeatures }) =>
            stream.send("task", { jobId, status, featureId, doneFeatures }),
        );
        const stopAgent = subscribeBoard(query.planId, ({ taskId, status, reason }) =>
          stream.send("agent", { taskId, status, reason }),
        );
        return () => {
          stopJobs();
          stopAgent();
        };
      },
    );
  },
);
