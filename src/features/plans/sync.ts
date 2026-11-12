import { z } from "zod";

/**
 * Sinkronisasi PRD, fitur, dan task (R14), disimpan di `plans.sync_state` di samping data roadmap.
 * - `prd.dirty`: PRD berubah (revisi chat atau edit) sejak fitur terakhir disesuaikan dengannya.
 * - `staleFeatureIds`: fitur yang berubah sesudah spesifikasi dan task-nya dibuat.
 */
export type PlanSync = {
  prd: { dirty: boolean; version: number | null };
  staleFeatureIds: string[];
};

const syncSchema = z.object({
  prd: z
    .object({ dirty: z.boolean(), version: z.number().int().nullable() })
    .catch({ dirty: false, version: null }),
  staleFeatureIds: z.array(z.string()).catch([]),
});

/** Membaca bagian sinkronisasi dari `syncState`; nilai yang rusak atau belum ada dianggap bersih. */
export function readSync(syncState: Record<string, unknown>): PlanSync {
  return syncSchema.parse({
    prd: syncState.prd ?? { dirty: false, version: null },
    staleFeatureIds: syncState.staleFeatureIds ?? [],
  });
}
