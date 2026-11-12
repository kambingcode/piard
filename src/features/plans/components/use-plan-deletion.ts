"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { showUndoToast } from "@/components/patterns/confirm-undo";
import { apiRequest } from "@/lib/api-client";
import { createHiddenSet } from "@/lib/hidden-set";
import { plansCopy } from "../copy";
import type { Plan } from "../schemas";
import { planTitle } from "../title";

const NOT_FOUND = 404;

/** Dibagi semua komponen: menghapus dari sidebar juga menyembunyikan plan di daftar utama. */
const hiddenPlans = createHiddenSet();

/**
 * Hapus plan dengan Undo 8 detik: plan langsung disembunyikan, dan DELETE baru dikirim setelah
 * jendela Undo habis. Gagal menghapus mengembalikan plan ke daftar dan memberi tahu pengguna.
 */
export function usePlanDeletion() {
  const router = useRouter();
  const pathname = usePathname();
  const hidden = useSyncExternalStore(
    hiddenPlans.subscribe,
    hiddenPlans.getSnapshot,
    hiddenPlans.getServerSnapshot,
  );

  function remove(plan: Plan) {
    hiddenPlans.hide(plan.id);
    showUndoToast({
      message: plansCopy.actions.deleted(planTitle(plan)),
      onUndo: () => hiddenPlans.unhide(plan.id),
      onCommit: async () => {
        const result = await apiRequest(`/api/plan/${plan.id}`, { method: "DELETE" });
        // 404 berarti sudah terhapus (mis. dari tab lain): tujuan tercapai.
        if (!result.ok && result.status !== NOT_FOUND) {
          hiddenPlans.unhide(plan.id);
          toast.error(plansCopy.actions.deleteFailed);
          return;
        }
        if (pathname.startsWith(`/plans/${plan.id}`)) router.replace("/plan");
        router.refresh();
      },
    });
  }

  return { hidden, remove };
}
