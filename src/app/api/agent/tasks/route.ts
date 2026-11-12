import { agentTaskListQuerySchema } from "@/features/agent-bridge";
import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/** Daftar task plan (tanpa prompt penuh), opsional per status/fitur → `{tasks}`. */
export const GET = agentRoute(
  { query: agentTaskListQuerySchema },
  async ({ user, query }) => ({
    tasks: getAgentApiService().listTasks(user, query),
  }),
);
