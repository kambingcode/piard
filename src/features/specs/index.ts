/** API publik fitur spesifikasi & task yang aman untuk klien: skema, tipe, teks, dan komponen. */

export { BuildView } from "./components/build-view";
export type { BuildData } from "./components/use-build";
export { specsCopy } from "./copy";
export { buildSteps } from "./progress";
export {
  BUILD_PHASES,
  BUILD_STATUSES,
  type BuildJobEvent,
  type BuildPhase,
  type BuildState,
  type BuildStatus,
  buildQuerySchema,
  buildStateSchema,
  generateFeatureTasksSchema,
  startBuildSchema,
} from "./schemas";
export { renderSpec } from "./spec-markdown";
