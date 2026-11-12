import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/** PRD terbaru → `{prd: {version, content, truncated} | null}` (maks. 60.000 karakter). */
export const GET = agentRoute({}, async ({ user }) => getAgentApiService().getPrd(user));
