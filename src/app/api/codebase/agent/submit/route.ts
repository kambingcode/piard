import { getAgentService } from "@/features/codebase/server";
import { readBodyLimited } from "@/server/http/body";
import { publicRoute } from "@/server/http/route";

/**
 * Kiriman dokumentasi dari agen lokal (ADR 0016). Otorisasi `Authorization: Bearer pcb_…` (bukan cookie),
 * diperiksa sebelum badan dibaca; badan JSON `{pages: [{slug, content}], detectedStack?}` maks. 1 MB →
 * `{codebaseId, added, redactions}`. Token salah/kedaluwarsa/dicabut dijawab 401 seragam.
 */
export const POST = publicRoute({}, async ({ request }) => {
  const agent = getAgentService();
  const session = agent.authenticate(request.headers.get("authorization"));
  const limit = agent.submitLimit();
  const body = await readBodyLimited(request, limit.bytes, limit.messages);
  return agent.submit(session, body);
});
