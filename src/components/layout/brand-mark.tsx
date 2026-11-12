import { cn } from "@/lib/cn";

/**
 * Tanda Piard: huruf "P" yang dibangun dari batang tegak dan lengkung, dengan satu titik
 * (kursor yang berkedip saat teks mengalir). Dibuat untuk produk ini, bukan huruf di kotak hitam.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-6 shrink-0 text-foreground", className)}
    >
      <title>Piard</title>
      <rect x="4" y="3" width="3.5" height="18" rx="1.75" fill="currentColor" />
      <path
        d="M9.5 4.75h4.25a4.25 4.25 0 0 1 0 8.5H9.5"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.75" cy="19" r="1.75" fill="var(--accent)" />
    </svg>
  );
}
