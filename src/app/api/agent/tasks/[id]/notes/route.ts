import { agentNoteSchema, idParamsSchema } from "@/features/agent-bridge";
import { agentRoute, getAgentApiService } from "@/features/agent-bridge/server";

/** Catatan atau pertanyaan (`kind: note|question`) pada task yang sedang dipegang → `{note}`. */
export const POST = agentRoute(
  { params: idParamsSchema, body: agentNoteSchema },
  async ({ user, params, body }) => ({
    note: getAgentApiService().addNote(user, params.id, body),
  }),
);
