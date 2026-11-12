import { cn } from "@/lib/cn";
import { patternCopy } from "./copy";

type StreamingTextProps = {
  text: string;
  /** True selama teks masih mengalir; menampilkan kursor berkedip. */
  streaming: boolean;
  /** Tinggi minimum agar blok tidak melompat saat teks pertama tiba. */
  className?: string;
};

/**
 * Teks yang dialirkan (PRD, chat). Pembaca layar tidak diberi tiap potongan kata:
 * `aria-busy` selama mengalir, lalu satu pengumuman saat selesai.
 */
export function StreamingText({ text, streaming, className }: StreamingTextProps) {
  return (
    <div>
      <div
        aria-busy={streaming}
        className={cn("whitespace-pre-wrap break-words", className)}
      >
        {text}
        {streaming ? <span className="stream-caret" aria-hidden /> : null}
      </div>
      <output className="sr-only">
        {!streaming && text ? patternCopy.streaming.finished : ""}
      </output>
    </div>
  );
}
