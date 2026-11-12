import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema, githubSourceSchema } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";

/**
 * Sumber dari URL repo GitHub (`{url, token?}`) → `{codebase}` berstatus `source_ready`. Hanya
 * `api.github.com`/`codeload.github.com` yang dihubungi; `token` tidak disimpan dan tidak dicatat.
 */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema, body: githubSourceSchema },
  async ({ user, params: { id }, body }) => ({
    codebase: await getCodebaseService().receiveGithub(user.id, id, body),
  }),
);
