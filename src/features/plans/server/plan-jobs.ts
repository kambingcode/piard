import "server-only";

import type { JobRunner } from "@/server/jobs";
import type { PlansService } from "./service";

type Deps = { plans: PlansService; jobs: Pick<JobRunner, "cancelForPlan"> };

/** Job AI per plan dari sisi pengguna: saat ini hanya "Batalkan" pada progres (doc 08 bagian 6). */
export function createPlanJobsService({ plans, jobs }: Deps) {
  return {
    /**
     * Membatalkan job aktif plan. Job yang sedang berjalan berhenti di langkah berikutnya; hasil yang sudah
     * tersimpan (fitur, draf) tetap ada dan bisa dilanjutkan.
     * @throws {AppError} `NOT_FOUND` bila plan bukan milik pengguna.
     */
    cancel(userId: string, planId: string): { cancelled: number } {
      plans.getPlan(userId, planId);
      return { cancelled: jobs.cancelForPlan(planId) };
    },
  };
}

export type PlanJobsService = ReturnType<typeof createPlanJobsService>;
