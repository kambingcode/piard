import { authedRoute } from "@/features/auth/server";
import { planQuerySchema, sendMessageSchema } from "@/features/revision";
import { getRevisionService } from "@/features/revision/server";
import { ndjsonResponse } from "@/server/http/ndjson";

/** Riwayat chat revisi plan → `{messages}`. */
export const GET = authedRoute({ query: planQuerySchema }, async ({ user, query }) => ({
  messages: getRevisionService().listMessages(user.id, query.planId),
}));

/** Mengirim pesan → aliran NDJSON `user`, `text`, `part`, lalu `done` atau `error`. */
export const POST = authedRoute(
  { body: sendMessageSchema },
  async ({ request, user, body }) =>
    ndjsonResponse(
      getRevisionService().sendMessage(user.id, body.planId, body.text, request.signal),
    ),
);
