import { idParamsSchema, reportSchema } from "@/features/agent-bridge";
import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/**
 * Lapor task selesai dikerjakan `doing → review` (idempoten) → `{task}`. Badan
 * `{summary, verification, filesChanged?}`; hanya pengguna yang memindahkan ke Selesai.
 */
export const POST = agentRoute(
  { params: idParamsSchema, body: reportSchema },
  async ({ user, params, body }) => ({
    task: getAgentApiService().report(user, params.id, body),
  }),
);
