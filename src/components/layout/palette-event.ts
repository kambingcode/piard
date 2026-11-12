/**
 * Event DOM untuk membuka command palette. Shell (umum) hanya memancarkannya; palette milik fitur yang
 * mendengarkan, jadi `src/components` tidak perlu mengenal fitur.
 */
export const OPEN_PALETTE_EVENT = "piard:open-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}
