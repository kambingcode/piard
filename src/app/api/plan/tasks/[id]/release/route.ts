import { idParamsSchema } from "@/features/agent-bridge";
import { getBoardService } from "@/features/agent-bridge/server";
import { authedRoute } from "@/features/auth/server";

/** Mengambil kembali card Dikerjakan milik agen ke Todo → `{task}`. 409 bila bukan card agen. */
export const POST = authedRoute({ params: idParamsSchema }, async ({ user, params }) =>
  getBoardService().release(user.id, params.id),
);
