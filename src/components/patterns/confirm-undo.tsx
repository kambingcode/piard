"use client";

import { toast } from "sonner";
import { createUndoable, UNDO_WINDOW_MS } from "@/lib/undoable";
import { patternCopy } from "./copy";

type UndoToastOptions = {
  /** Kalimat konfirmasi, mis. `Fitur "Booking Dokter" dihapus.` */
  message: string;
  /** Aksi yang sebenarnya, dijalankan setelah jendela Undo habis (atau saat toast ditutup). */
  onCommit: () => void;
  /** Dipanggil bila pengguna mengurungkan, untuk memulihkan tampilan optimistis. */
  onUndo?: () => void;
  durationMs?: number;
};

/**
 * Pola Undo (doc 08 bagian 6): UI langsung menyembunyikan item, toast 8 detik menawarkan
 * "Urungkan"; aksi permanen baru berjalan setelah jendela habis. Menutup toast
 * lebih awal menjalankan aksi segera. Tab yang ditutup di tengah jendela tidak menjalankan
 * aksi, jadi item aman (tidak terhapus diam-diam).
 */
export function showUndoToast({
  message,
  onCommit,
  onUndo,
  durationMs = UNDO_WINDOW_MS,
}: UndoToastOptions): void {
  const pending = createUndoable(onCommit, durationMs);
  toast(message, {
    duration: durationMs,
    action: {
      label: patternCopy.undo,
      onClick: () => {
        if (pending.undo()) onUndo?.();
      },
    },
    onDismiss: () => pending.commitNow(),
    onAutoClose: () => pending.commitNow(),
  });
}
