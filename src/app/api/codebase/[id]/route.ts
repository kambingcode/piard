import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema, patchCodebaseSchema } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";

const params = codebaseIdParamsSchema;

/** Detail proyek eksisting → `{codebase}` (manifes tanpa daftar berkas). */
export const GET = authedRoute({ params }, async ({ user, params: { id } }) => ({
  codebase: getCodebaseService().get(user.id, id),
}));

/** Mengganti nama proyek → `{codebase}`. */
export const PATCH = authedRoute(
  { params, body: patchCodebaseSchema },
  async ({ user, params: { id }, body }) => ({
    codebase: getCodebaseService().rename(user.id, id, body),
  }),
);

/**
 * Menghapus proyek beserta dokumentasi dan token agennya; plan tertaut tetap ada →
 * `{ok: true, keptPlans}` (jumlah plan yang kini tanpa tautan proyek).
 */
export const DELETE = authedRoute({ params }, async ({ user, params: { id } }) => ({
  ok: true,
  ...getCodebaseService().delete(user.id, id),
}));
