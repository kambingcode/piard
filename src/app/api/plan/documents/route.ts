import { authedRoute } from "@/features/auth/server";
import { documentQuerySchema } from "@/features/prd";
import { getPrdService } from "@/features/prd/server";

/** Tanpa `version`: `{versions}` (riwayat tanpa isi). Dengan `version`: `{document}`. */
export const GET = authedRoute({ query: documentQuerySchema }, async ({ user, query }) =>
  query.version === undefined
    ? { versions: getPrdService().listVersions(user.id, query.planId) }
    : { document: getPrdService().getVersion(user.id, query.planId, query.version) },
);
