/**
 * Pintu server fitur codebase (proyek eksisting): route handler, halaman, dan fitur lain yang butuh
 * konteks codebase. Kode klien memakai `./index`.
 */
import "server-only";

/** Sensor rahasia (M7) untuk fitur lain yang mengeluarkan/menyimpan teks bebas (jembatan agen, ADR 0017). */
export { redactSecrets } from "./scan/redact";
export { type AgentService, createAgentService } from "./server/agent";
export {
  ANALYSIS_PHASES,
  ANALYZE_JOB,
  type AnalysisEstimate,
  type AnalysisPhase,
  type AnalysisService,
  type AnalysisStatus,
  createAnalysisService,
} from "./server/analyze";
export {
  codebaseJobHandlers,
  getAgentService,
  getAnalysisService,
  getCodebaseService,
} from "./server/instance";
export { type CodebaseService, createCodebaseService } from "./server/service";
