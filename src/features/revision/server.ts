/** Pintu server fitur revisi: route handler, halaman, dan instrumentation. */
import "server-only";

export { getRevisionService, revisionJobHandlers } from "./server/instance";
export type { RevisionService } from "./server/service";
