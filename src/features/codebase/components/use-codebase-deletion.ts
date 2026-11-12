"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { showUndoToast } from "@/components/patterns/confirm-undo";
import { createHiddenSet } from "@/lib/hidden-set";
import { codebaseCopy } from "../copy";
import { codebaseApi } from "./codebase-api";

const NOT_FOUND = 404;
const LIST_HREF = "/codebases";

/** Dibagi semua komponen: menghapus dari sidebar juga menyembunyikan proyek di daftar utama. */
const hiddenCodebases = createHiddenSet();

/**
 * Hapus proyek eksisting dengan Undo 8 detik (M7-17): langsung disembunyikan, DELETE baru dikirim
 * setelah jendela Undo habis. Server menghapus dokumentasi, token, dan sumber sementara; plan yang
 * tertaut tetap ada. Gagal menghapus mengembalikan proyek ke daftar.
 */
export function useCodebaseDeletion() {
  const router = useRouter();
  const pathname = usePathname();
  const hidden = useSyncExternalStore(
    hiddenCodebases.subscribe,
    hiddenCodebases.getSnapshot,
    hiddenCodebases.getServerSnapshot,
  );

  function remove(codebase: { id: string; name: string }) {
    hiddenCodebases.hide(codebase.id);
    showUndoToast({
      message: codebaseCopy.ui.list.deleted(codebase.name),
      onUndo: () => hiddenCodebases.unhide(codebase.id),
      onCommit: async () => {
        const result = await codebaseApi.remove(codebase.id);
        // 404 berarti sudah terhapus (mis. dari tab lain): tujuan tercapai.
        if (!result.ok && result.status !== NOT_FOUND) {
          hiddenCodebases.unhide(codebase.id);
          toast.error(codebaseCopy.ui.list.deleteFailed);
          return;
        }
        const kept = result.ok ? result.data.keptPlans : 0;
        if (kept > 0) toast.info(codebaseCopy.ui.list.keptPlans(kept));
        // Sama dengan hapus plan: pindah setelah jendela Undo habis, jadi "Urungkan" tidak memindahkan.
        if (pathname.startsWith(`/codebases/${codebase.id}`)) router.replace(LIST_HREF);
        router.refresh();
      },
    });
  }

  return { hidden, remove };
}
