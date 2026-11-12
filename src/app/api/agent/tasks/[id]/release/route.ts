import { idParamsSchema, releaseSchema } from "@/features/agent-bridge";
import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/** Melepas task yang dipegang `doing → todo` dengan alasan → `{task}`. */
export const POST = agentRoute(
  { params: idParamsSchema, body: releaseSchema },
  async ({ user, params, body }) => ({
    task: getAgentApiService().release(user, params.id, body.reason),
  }),
);
