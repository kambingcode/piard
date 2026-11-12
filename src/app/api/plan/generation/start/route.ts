import { authedRoute } from "@/features/auth/server";
import { startBuildSchema } from "@/features/specs";
import { getSpecsService } from "@/features/specs/server";

/** Memulai job spesifikasi & task → `{status}`; tanpa `regenerate` hanya fitur yang belum lengkap. */
export const POST = authedRoute({ body: startBuildSchema }, async ({ user, body }) =>
  getSpecsService().startBuild(user.id, body.planId, { regenerate: body.regenerate }),
);
