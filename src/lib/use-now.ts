"use client";

import { useEffect, useState } from "react";

/** `Date.now()` yang diperbarui tiap `intervalMs` selama komponen tampil (untuk jam dan perkiraan waktu). */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
