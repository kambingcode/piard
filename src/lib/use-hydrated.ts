"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False di server dan selama hidrasi, true sesudahnya. Dipakai untuk menonaktifkan tombol kirim
 * sampai handler React terpasang, supaya submit asli browser tidak menimpa halaman.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
