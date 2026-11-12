import type { SaveStatus } from "@/lib/autosave";
import { cn } from "@/lib/cn";
import { plansCopy } from "../copy";

/** Status autosave yang terlihat (dan diumumkan sopan ke pembaca layar). */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const text = status === "idle" ? "" : plansCopy.saveStatus[status];
  return (
    <output
      className={cn(
        "min-h-5 text-xs tabular",
        status === "error" ? "text-negative" : "text-muted-foreground",
      )}
    >
      {text}
    </output>
  );
}
