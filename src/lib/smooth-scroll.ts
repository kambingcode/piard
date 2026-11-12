/** Easing ease-out quint: cepat di awal, makin melambat saat mendekati tujuan, lalu berhenti lembut. */
export const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;

/** Durasi menurut jarak: lompatan pendek tetap cepat, halaman panjang tidak terasa melempar. */
export function scrollDuration(distance: number) {
  return Math.min(900, Math.max(350, 300 + Math.abs(distance) * 0.25));
}

/**
 * Gulir jendela ke `top` dengan animasi; berhenti bila pengguna ikut menggulir (roda, sentuh, tombol)
 * agar tidak melawan tangannya. Mengembalikan fungsi pembatal. Bila gerak dikurangi, langsung lompat.
 */
export function smoothScrollTo(top: number): () => void {
  const start = window.scrollY;
  const distance = top - start;
  if (distance === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo({ top });
    return () => {};
  }

  const duration = scrollDuration(distance);
  let frame = 0;
  let begin: number | null = null;
  const events = ["wheel", "touchstart", "keydown"] as const;
  const cancel = () => {
    cancelAnimationFrame(frame);
    for (const name of events) window.removeEventListener(name, cancel);
  };
  for (const name of events) window.addEventListener(name, cancel, { passive: true });

  const step = (now: number) => {
    begin ??= now;
    const t = Math.min(1, (now - begin) / duration);
    // `behavior: "instant"` mengabaikan `scroll-behavior: smooth` CSS yang bisa menumpuk animasi.
    window.scrollTo({ top: start + distance * easeOutQuint(t), behavior: "instant" });
    if (t < 1) frame = requestAnimationFrame(step);
    else cancel();
  };
  frame = requestAnimationFrame(step);
  return cancel;
}
