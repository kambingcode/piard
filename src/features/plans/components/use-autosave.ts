"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createAutosaver, type SaveStatus } from "@/lib/autosave";

/**
 * Autosave untuk komponen: `schedule(nilai)` menyimpan dengan debounce, `flush()` sebelum pindah
 * langkah. Perubahan yang tertunda disimpan saat komponen dilepas.
 */
export function useAutosave<T>(save: (value: T) => Promise<void>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const saver = useMemo(
    () =>
      createAutosaver<T>({
        save: (value) => saveRef.current(value),
        onStatus: setStatus,
      }),
    [],
  );
  useEffect(() => () => void saver.flush(), [saver]);

  return { status, schedule: saver.schedule, flush: saver.flush };
}
