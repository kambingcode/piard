import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/**
 * Task berikutnya → `{task, alreadyClaimed}`: task `doing` yang masih dipegang token ini bila ada, selain
 * itu task `todo` pertama menurut urutan roadmap; `task: null` bila tidak ada lagi.
 */
export const GET = agentRoute({}, async ({ user }) => getAgentApiService().next(user));
