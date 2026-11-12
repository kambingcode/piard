/** API publik fitur PRD yang aman untuk klien: skema, tipe, teks, dan komponen. */

export { PrdMarkdown } from "./components/prd-markdown";
export { PrdView } from "./components/prd-view";
export type { PrdController } from "./components/use-prd";
export { prdCopy } from "./copy";
export { prdSteps } from "./progress";
export {
  documentQuerySchema,
  generatePrdSchema,
  PRD_JOB_KINDS,
  PRD_MAX_LENGTH,
  PRD_PHASES,
  PRD_STATUSES,
  PRD_TITLE,
  type PrdDocument,
  type PrdJobKind,
  type PrdPhase,
  type PrdState,
  type PrdStatus,
  type PrdVersion,
  prdDocumentSchema,
  prdQuerySchema,
  prdStateSchema,
  prdVersionSchema,
  restoreDocumentSchema,
  reviseSchema,
  type SaveDocumentInput,
  saveDocumentSchema,
} from "./schemas";
export {
  checkPrdStructure,
  cleanPrd,
  isCompletePrd,
  mermaidBlocks,
  PRD_SECTION_COUNT,
  PRD_SECTIONS,
  type PrdStructure,
} from "./structure";
