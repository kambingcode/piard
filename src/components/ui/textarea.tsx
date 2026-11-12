import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-control border border-control-border bg-card px-3.5 py-3 text-base",
        "text-foreground placeholder:text-muted-foreground md:text-sm",
        "transition-[border-color,box-shadow] duration-150",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-negative",
        className,
      )}
      {...props}
    />
  );
}
