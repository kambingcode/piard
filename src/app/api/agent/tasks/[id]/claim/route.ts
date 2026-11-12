import { idParamsSchema } from "@/features/agent-bridge";
import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/**
 * Klaim task `todo → doing` (atomik; idempoten untuk token yang sama) → `{task}`. 409 bila task bukan
 * Todo, dipegang agen lain, atau token masih memegang task lain.
 */
export const POST = agentRoute({ params: idParamsSchema }, async ({ user, params }) => ({
  task: getAgentApiService().claim(user, params.id),
}));
