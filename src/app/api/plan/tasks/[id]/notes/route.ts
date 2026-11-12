import { idParamsSchema, userNoteSchema } from "@/features/agent-bridge";
import { getBoardService } from "@/features/agent-bridge/server";
import { authedRoute } from "@/features/auth/server";

/** Linimasa card (laporan dan pertanyaan agen, catatan pengguna, peristiwa) → `{notes}`. */
export const GET = authedRoute({ params: idParamsSchema }, async ({ user, params }) => ({
  notes: getBoardService().notes(user.id, params.id),
}));

/** Catatan atau jawaban pengguna `{body}` → `{note}`; dibaca agen lewat `get_task`. */
export const POST = authedRoute(
  { params: idParamsSchema, body: userNoteSchema },
  async ({ user, params, body }) => ({
    note: getBoardService().addNote(user.id, params.id, body.body),
  }),
);
