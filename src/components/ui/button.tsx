import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Tombol. `primary` pil hitam adalah satu-satunya aksi utama per layar (doc 08).
 * Tinggi minimal 44px di layar sentuh (md ke atas boleh lebih rapat).
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-medium",
    "transition-[background-color,color,border-color,opacity] duration-150",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "rounded-full bg-primary text-primary-foreground hover:opacity-85",
        secondary:
          "rounded-full border border-control-border bg-card text-foreground hover:bg-muted",
        ghost: "rounded-control text-foreground hover:bg-active",
        link: "rounded-chip text-accent underline-offset-4 hover:underline",
        destructive: "rounded-full bg-negative text-accent-foreground hover:opacity-85",
      },
      size: {
        sm: "h-10 px-4 text-sm md:h-8 md:px-3",
        md: "h-11 px-5 text-sm md:h-10",
        lg: "h-12 px-6 text-base",
        icon: "size-11 md:size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
