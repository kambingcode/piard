"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { patternCopy } from "./copy";

const COPIED_MS = 2_000;

/** Salin teks satu klik (mis. prompt task); ikon berubah sebentar dan toast mengumumkan hasilnya. */
export function CopyButton({
  text,
  children,
  label,
  size = "sm",
}: {
  text: string;
  /** Teks tombol, mis. "Salin prompt". */
  children: string;
  /** Nama aksesibel bila tombol yang sama muncul berkali-kali (mis. menyebut judul task). */
  label?: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success(patternCopy.copy.done);
          setTimeout(() => setCopied(false), COPIED_MS);
        } catch {
          toast.error(patternCopy.copy.failed);
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {children}
    </Button>
  );
}
