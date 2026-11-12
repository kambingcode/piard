import "server-only";

import { createRouteBuilder } from "@/server/http/route";
import { agentBridgeCopy } from "../copy";
import { AGENT_BODY_MAX_BYTES } from "../limits";
import { getTokenService } from "./instance";
import type { AgentSession } from "./tokens";

/**
 * Pembangun route `/api/agent/*` (ADR 0017): hanya `Authorization: Bearer ppl_…`, cookie sesi tidak
 * dibaca; token diperiksa sebelum badan dibaca; badan JSON maks. 64 KB. Handler menerima
 * `ctx.user` = sesi agen (token, plan, pemilik plan).
 */
export const agentRoute = createRouteBuilder<AgentSession>(
  async (request) => getTokenService().authenticate(request.headers.get("authorization")),
  "agent",
  { maxBodyBytes: AGENT_BODY_MAX_BYTES, tooLargeMessage: agentBridgeCopy.agent.tooLarge },
);
