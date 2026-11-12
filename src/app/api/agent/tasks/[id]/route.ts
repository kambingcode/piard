import { idParamsSchema } from "@/features/agent-bridge";
import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/** Detail task → `{task}`: prompt, fitur + spesifikasi, bagian PRD terkait, catatan, instruksi proyek. */
export const GET = agentRoute({ params: idParamsSchema }, async ({ user, params }) => ({
  task: getAgentApiService().getTask(user, params.id),
}));
