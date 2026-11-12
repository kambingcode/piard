import { z } from "zod";

const idSchema = z.string().min(1).max(64);

/** `md`: PRD saja (`<slug>-PRD.md`); `zip`: PRD + berkas per fitur (doc 04). */
export const EXPORT_FORMATS = ["md", "zip"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const exportQuerySchema = z.object({
  planId: idSchema,
  format: z.enum(EXPORT_FORMATS).default("md"),
  /** Hanya untuk `md`: versi PRD tertentu; tanpa ini versi terbaru. */
  version: z.coerce.number().int().min(1).optional(),
});
