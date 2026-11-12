import { authedRoute } from "@/features/auth/server";
import { generateFeatureTasksSchema } from "@/features/specs";
import { getSpecsService } from "@/features/specs/server";

/** Menyusun ulang task satu fitur → `{status}`. */
export const POST = authedRoute(
  { body: generateFeatureTasksSchema },
  async ({ user, body }) => getSpecsService().startFeatureTasks(user.id, body.featureId),
);
