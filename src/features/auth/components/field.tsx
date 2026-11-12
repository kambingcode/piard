import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldProps = ComponentProps<typeof Input> & {
  id: string;
  label: string;
  /** Pesan galat untuk kolom ini; dihubungkan lewat aria-describedby. */
  error?: string;
};

/** Label di atas kolom (bukan placeholder), galat tepat di bawah kolom yang bermasalah. */
export function Field({ id, label, error, ...inputProps }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
