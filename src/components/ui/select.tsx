import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Pilihan bawaan browser (aksesibel, nyaman di ponsel) dengan gaya token Piard. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        className={cn(
          "h-11 w-full cursor-pointer appearance-none rounded-control border border-control-border bg-card",
          "pr-10 pl-3.5 text-base text-foreground md:h-10 md:text-sm",
          "transition-[border-color,box-shadow] duration-150",
          "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </span>
  );
}
