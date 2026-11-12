"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

// Sonner membaca warna dari variabel CSS; dipetakan ke token desain Piard.
const toasterStyle = {
  "--normal-bg": "var(--card)",
  "--normal-text": "var(--foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius-control)",
} as CSSProperties; // variabel kustom tidak ada di tipe CSSProperties

/** Satu Toaster untuk seluruh aplikasi, dipasang di layout akar. Toast tidak mengambil fokus. */
export function Toaster() {
  return <Sonner position="bottom-center" theme="system" style={toasterStyle} />;
}
