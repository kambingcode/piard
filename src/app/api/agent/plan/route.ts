import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/**
 * Ringkasan plan untuk agen → `{plan, progress, features, instructions, you}`. `you.holding` = task
 * `doing` yang sedang dipegang token ini.
 */
export const GET = agentRoute({}, async ({ user }) =>
  getAgentApiService().overview(user),
);
