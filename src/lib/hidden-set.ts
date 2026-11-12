export type HiddenSet = {
  subscribe(listener: () => void): () => void;
  /** Snapshot stabil: referensi sama sampai ada perubahan (syarat `useSyncExternalStore`). */
  getSnapshot(): ReadonlySet<string>;
  getServerSnapshot(): ReadonlySet<string>;
  hide(id: string): void;
  unhide(id: string): void;
};

/**
 * Himpunan id yang disembunyikan sementara dan dibagi ke semua komponen (mis. sidebar dan daftar
 * utama menyembunyikan plan yang sama selama jendela Undo).
 */
export function createHiddenSet(): HiddenSet {
  const empty: ReadonlySet<string> = new Set();
  let current: ReadonlySet<string> = empty;
  const listeners = new Set<() => void>();

  const set = (next: ReadonlySet<string>) => {
    current = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => current,
    getServerSnapshot: () => empty,
    hide(id) {
      if (!current.has(id)) set(new Set(current).add(id));
    },
    unhide(id) {
      if (current.has(id)) set(new Set([...current].filter((other) => other !== id)));
    },
  };
}
