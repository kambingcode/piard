import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ChoiceProps = {
  type: "radio" | "checkbox";
  checked: boolean;
  onChange: () => void;
  /** Radio dalam satu grup berbagi `name` agar navigasi panah bekerja. */
  name?: string;
  disabled?: boolean;
  children: ReactNode;
  /** Gaya kotak pilihan; kelas keadaan terpilih ditambahkan lewat `selectedClassName`. */
  className?: string;
  selectedClassName?: string;
  idleClassName?: string;
};

/**
 * Pilihan berbasis input native (radio/checkbox) yang disembunyikan secara visual dan diberi
 * label bergaya. Papan ketik, pembaca layar, dan grup radio bekerja tanpa ARIA tambahan.
 */
export function Choice({
  type,
  checked,
  onChange,
  name,
  disabled,
  children,
  className,
  selectedClassName = "border-foreground bg-card",
  idleClassName = "border-border bg-card hover:bg-muted",
}: ChoiceProps) {
  return (
    <label
      className={cn(
        "relative block",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        className={cn(
          "block border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          checked ? selectedClassName : idleClassName,
          className,
        )}
      >
        {children}
      </span>
    </label>
  );
}
