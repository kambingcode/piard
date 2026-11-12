"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Field } from "./field";

type PasswordFieldProps = {
  id?: string;
  label: string;
  error?: string;
  autoComplete: "current-password" | "new-password";
};

/** Label tetap; status ditandai `aria-pressed` (jangan menandai status dua kali). */
const TOGGLE_LABEL = "Tampilkan kata sandi";

/** Kolom kata sandi dengan tombol tampil/sembunyi. Tempel dan pengelola kata sandi tetap diizinkan. */
export function PasswordField({
  id = "password",
  label,
  error,
  autoComplete,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Field
        id={id}
        label={label}
        error={error}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={TOGGLE_LABEL}
        aria-pressed={visible}
        className="absolute top-[30px] right-1 flex size-10 cursor-pointer items-center justify-center rounded-control text-muted-foreground hover:text-foreground md:top-[30px] md:size-9"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
