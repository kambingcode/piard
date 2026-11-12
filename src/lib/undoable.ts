export const UNDO_WINDOW_MS = 8_000;

export type Undoable = {
  /** Membatalkan aksi bila belum dijalankan. @returns true bila berhasil dibatalkan. */
  undo(): boolean;
  /** Menjalankan aksi sekarang (mis. saat pengguna menutup toast). Tidak berefek bila sudah selesai/dibatalkan. */
  commitNow(): void;
  readonly state: "pending" | "committed" | "undone";
};

/**
 * Aksi yang ditunda: dijalankan setelah `delayMs` kecuali dibatalkan. Dasar pola Undo
 * (hapus fitur, task, plan). `onCommit` dijamin berjalan paling banyak sekali.
 */
export function createUndoable(
  onCommit: () => void,
  delayMs: number = UNDO_WINDOW_MS,
): Undoable {
  let state: Undoable["state"] = "pending";
  const timer = setTimeout(commitNow, delayMs);

  function commitNow() {
    if (state !== "pending") return;
    state = "committed";
    clearTimeout(timer);
    onCommit();
  }

  return {
    undo() {
      if (state !== "pending") return false;
      state = "undone";
      clearTimeout(timer);
      return true;
    },
    commitNow,
    get state() {
      return state;
    },
  };
}
