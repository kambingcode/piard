import { authedRoute } from "@/features/auth/server";
import { codebaseIdParamsSchema, importMarkdownSchema } from "@/features/codebase";
import { getAgentService } from "@/features/codebase/server";

/**
 * Jalur cadangan agen: hasil Markdown bersekat `<!-- piard:page <slug> -->` ditempel pengguna →
 * `{codebaseId, added, redactions, fixes}`. Disimpan sebagai versi `origin = agent`.
 */
export const POST = authedRoute(
  { params: codebaseIdParamsSchema, body: importMarkdownSchema },
  async ({ user, params: { id }, body }) =>
    getAgentService().importMarkdown(user.id, id, body.markdown),
);
