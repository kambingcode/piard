import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { collapseUnchanged, type DiffLine, diffLines } from "@/lib/line-diff";
import { prdCopy } from "../copy";

const copy = prdCopy.diff;

const SIGN: Record<DiffLine["kind"], string> = { same: " ", added: "+", removed: "−" };

/**
 * Perbedaan Markdown versi lama dengan versi terbaru (doc 08: riwayat versi dengan diff). Baris ditandai
 * tanda +/− dan warna (bukan warna saja); baris sama yang jauh dari perubahan dilipat.
 */
export function PrdDiff({
  before,
  after,
  beforeVersion,
  afterVersion,
}: {
  before: string;
  after: string;
  beforeVersion: number;
  afterVersion: number;
}) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const added = lines.filter((line) => line.kind === "added").length;
  const removed = lines.filter((line) => line.kind === "removed").length;
  const blocks = useMemo(() => collapseUnchanged(lines), [lines]);

  return (
    <section
      aria-label={copy.label(beforeVersion, afterVersion)}
      className="rounded-card bg-card p-4 md:p-6"
    >
      <p className="tabular text-sm text-muted-foreground">
        {added + removed === 0
          ? copy.identical
          : copy.summary(added, removed, beforeVersion, afterVersion)}
      </p>
      {added + removed === 0 ? null : (
        <div className="mt-4 rounded-control bg-background font-mono text-[13px] leading-relaxed">
          {blocks.map((block, index) =>
            block.kind === "collapsed" ? (
              <p
                // biome-ignore lint/suspicious/noArrayIndexKey: blok diff tidak punya id dan urutannya tetap
                key={index}
                className="px-3 py-1 text-muted-foreground"
              >
                {copy.collapsed(block.count)}
              </p>
            ) : (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: blok diff tidak punya id dan urutannya tetap
                key={index}
              >
                {block.lines.map((line, lineIndex) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: baris diff boleh sama teksnya
                    key={lineIndex}
                    className={cn(
                      "flex gap-3 px-3 whitespace-pre-wrap break-words",
                      line.kind === "added" && "bg-positive-soft",
                      line.kind === "removed" && "bg-negative-soft",
                    )}
                  >
                    <span
                      aria-hidden
                      className="w-3 shrink-0 select-none text-muted-foreground"
                    >
                      {SIGN[line.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      {line.kind === "same" ? null : (
                        <span className="sr-only">
                          {line.kind === "added" ? copy.addedLine : copy.removedLine}
                        </span>
                      )}
                      {line.text || " "}
                    </span>
                  </div>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
