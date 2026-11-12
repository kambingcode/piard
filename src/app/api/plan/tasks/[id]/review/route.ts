import { idParamsSchema, reviewSchema } from "@/features/agent-bridge";
import { getBoardService } from "@/features/agent-bridge/server";
import { authedRoute } from "@/features/auth/server";

/**
 * Tinjau card Review → `{task}`: `{decision: "approve"}` (ke Selesai) atau
 * `{decision: "changes", note}` (ke Todo dengan catatan untuk agen). 409 bila card sudah tidak di Review.
 */
export const POST = authedRoute(
  { params: idParamsSchema, body: reviewSchema },
  async ({ user, params, body }) => getBoardService().review(user.id, params.id, body),
);
