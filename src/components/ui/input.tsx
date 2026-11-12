import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Kolom isian satu baris. Label wajib ditampilkan di atasnya (jangan hanya placeholder). */
export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-control border border-control-border bg-card px-3.5 text-base",
        "text-foreground placeholder:text-muted-foreground md:h-10 md:text-sm",
        "transition-[border-color,box-shadow] duration-150",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-negative",
        className,
      )}
      {...props}
    />
  );
}
