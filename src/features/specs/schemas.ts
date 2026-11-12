import { z } from "zod";

const idSchema = z.string().min(1).max(64);

/** Fitur yang diproses bersamaan (doc 07 bagian 8.4: paralel terbatas). */
export const BUILD_CONCURRENCY = 3;

export const startBuildSchema = z.object({
  planId: idSchema,
  /** Menyusun ulang semua fitur; tanpa ini hanya fitur yang belum lengkap yang dikerjakan. */
  regenerate: z.boolean().default(false),
});

export const buildQuerySchema = z.object({ planId: idSchema });

export const generateFeatureTasksSchema = z.object({ featureId: idSchema });

/**
 * Keadaan spesifikasi & task plan: `idle` belum ada, `generating` job berjalan, `ready` semua fitur
 * lengkap, `partial` sebagian fitur belum lengkap (mis. fitur baru ditambahkan), `failed` job terakhir
 * gagal dan masih ada fitur yang belum lengkap.
 */
export const BUILD_STATUSES = [
  "idle",
  "generating",
  "ready",
  "partial",
  "failed",
] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

/** Fase job (situs acuan: `enrich`, `done`). */
export const BUILD_PHASES = ["queued", "reading", "features", "enrich", "done"] as const;
export type BuildPhase = (typeof BUILD_PHASES)[number];

export const buildStateSchema = z.object({
  status: z.enum(BUILD_STATUSES),
  totalFeatures: z.number().int(),
  doneFeatures: z.number().int(),
  incompleteFeatureIds: z.array(z.string()),
  /** Fitur yang berubah (usulan diterima) sesudah spesifikasi dan task-nya dibuat. */
  staleFeatureIds: z.array(z.string()),
  job: z
    .object({
      id: z.string(),
      kind: z.string(),
      phase: z.enum(BUILD_PHASES),
      error: z.string().nullable(),
    })
    .nullable(),
});
export type BuildState = z.infer<typeof buildStateSchema>;

/** Event SSE `job` (situs acuan: `phase`, `status`, `totalFeatures`, `doneFeatures`). */
export type BuildJobEvent = {
  jobId: string;
  kind: string;
  phase: BuildPhase;
  status: "queued" | "running" | "done" | "error";
  totalFeatures: number;
  doneFeatures: number;
  /** Fitur yang task-nya baru diganti (job task satu fitur). */
  featureId: string | null;
  error: string | null;
};
