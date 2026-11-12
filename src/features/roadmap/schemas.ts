import { z } from "zod";

/** Batas isian yang diketik pengguna saat mengedit roadmap. */
export const NAME_MAX_LENGTH = 80;
export const SUMMARY_MAX_LENGTH = 400;
export const MAX_PHASE = 10;

export const FEATURE_STATUSES = ["planned", "in-progress", "done"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

const idSchema = z.string().min(1).max(64);
const nameSchema = z
  .string()
  .trim()
  .min(1, "Nama tidak boleh kosong.")
  .max(NAME_MAX_LENGTH);
const summarySchema = z.string().trim().max(SUMMARY_MAX_LENGTH);
const phaseSchema = z.number().int().min(1).max(MAX_PHASE);

/** Fitur atau sub-fitur pada respons API (bentuk sama dengan analysis/api-samples/roadmap-generate-ready.json). */
export const roadmapFeatureSchema = z.object({
  id: z.string(),
  planId: z.string(),
  workspaceId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  summary: z.string(),
  icon: z.string().nullable(),
  status: z.enum(FEATURE_STATUSES),
  priority: z.string().nullable(),
  phase: z.number().int().nullable(),
  spec: z.string(),
  isDraft: z.boolean(),
  source: z.enum(["ai", "user"]),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RoadmapFeature = z.infer<typeof roadmapFeatureSchema>;

/** Sub-fitur membawa `featureId` (= `parentId`) seperti situs acuan. */
export const roadmapSubFeatureSchema = roadmapFeatureSchema.extend({
  parentId: z.string(),
  featureId: z.string(),
});
export type RoadmapSubFeature = z.infer<typeof roadmapSubFeatureSchema>;

/**
 * Keadaan roadmap sebuah plan:
 * `idle` belum pernah dibuat, `generating` job berjalan (daftar berisi hasil parsial),
 * `ready` selesai, `failed` job terakhir gagal (daftar bisa berisi hasil parsial).
 */
export const ROADMAP_STATUSES = ["idle", "generating", "ready", "failed"] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

/** Fase job roadmap, dipakai UI progres. */
export const ROADMAP_PHASES = [
  "queued",
  "reading",
  "features",
  "finishing",
  "done",
] as const;
export type RoadmapPhase = (typeof ROADMAP_PHASES)[number];

export const roadmapStateSchema = z.object({
  status: z.enum(ROADMAP_STATUSES),
  title: z.string().nullable(),
  features: z.array(roadmapFeatureSchema),
  subFeatures: z.array(roadmapSubFeatureSchema),
  job: z
    .object({
      id: z.string(),
      phase: z.enum(ROADMAP_PHASES),
      done: z.number().int(),
      error: z.string().nullable(),
    })
    .nullable(),
});
export type RoadmapState = z.infer<typeof roadmapStateSchema>;

export const generateRoadmapSchema = z.object({
  planId: idSchema,
  /** Membuat ulang walau roadmap sudah ada; fitur lama (termasuk buatan pengguna) diganti. */
  regenerate: z.boolean().default(false),
});

export const planQuerySchema = z.object({ planId: idSchema });
export const subFeatureListQuerySchema = z.object({
  planId: idSchema,
  featureId: idSchema.optional(),
});
export const featureIdParamsSchema = z.object({ id: idSchema });

export const createFeatureSchema = z.object({
  planId: idSchema,
  name: nameSchema,
  summary: summarySchema.default(""),
  /** Bawaan: fase terakhir yang sudah ada (atau 1). */
  phase: phaseSchema.optional(),
});
export type CreateFeatureInput = z.infer<typeof createFeatureSchema>;

export const createSubFeatureSchema = z.object({
  featureId: idSchema,
  name: nameSchema,
  summary: summarySchema.default(""),
});
export type CreateSubFeatureInput = z.infer<typeof createSubFeatureSchema>;

const atLeastOne = (patch: Record<string, unknown>) =>
  Object.values(patch).some((value) => value !== undefined);

export const patchFeatureSchema = z
  .object({
    name: nameSchema.optional(),
    summary: summarySchema.optional(),
    phase: phaseSchema.optional(),
    status: z.enum(FEATURE_STATUSES).optional(),
  })
  .refine(atLeastOne, "Tidak ada perubahan yang dikirim.");
export type PatchFeatureInput = z.infer<typeof patchFeatureSchema>;

export const patchSubFeatureSchema = z
  .object({
    name: nameSchema.optional(),
    summary: summarySchema.optional(),
    status: z.enum(FEATURE_STATUSES).optional(),
  })
  .refine(atLeastOne, "Tidak ada perubahan yang dikirim.");
export type PatchSubFeatureInput = z.infer<typeof patchSubFeatureSchema>;

const changeTextSchema = z.object({ name: z.string(), summary: z.string() });

/**
 * Satu perubahan fitur level atas yang diusulkan AI (chat revisi atau "Sesuaikan fitur dengan PRD")
 * dan disimpan di `sync_proposals.ops`. `update` dan `remove` membawa keadaan sebelumnya agar usulan
 * tetap terbaca walau fiturnya kemudian berubah.
 */
export const featureChangeSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    name: z.string(),
    summary: z.string(),
    phase: z.number().int().nullable(),
    subFeatures: z.array(changeTextSchema),
  }),
  z.object({
    op: z.literal("update"),
    featureId: z.string(),
    name: z.string().optional(),
    summary: z.string().optional(),
    phase: z.number().int().optional(),
    before: changeTextSchema.extend({ phase: z.number().int().nullable() }),
  }),
  z.object({ op: z.literal("remove"), featureId: z.string(), name: z.string() }),
]);
export type FeatureChange = z.infer<typeof featureChangeSchema>;
export type FeatureChangeOp = FeatureChange["op"];

/** Hasil menerapkan perubahan: fitur yang ditambah/diubah (spesifikasi & task-nya basi) dan dihapus. */
export type AppliedChanges = { changedIds: string[]; removedIds: string[] };
