import { Check, ChevronRight, Circle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { type Step, type StepStatus, summarizeSteps } from "@/lib/steps";
import { patternCopy } from "./copy";

const STATUS_STYLE: Record<StepStatus, string> = {
  pending: "text-muted-foreground",
  running: "text-accent",
  done: "text-positive",
  failed: "text-negative",
};

function StatusIcon({ status }: { status: StepStatus }) {
  const common = {
    className: cn("size-4 shrink-0", STATUS_STYLE[status]),
    "aria-hidden": true,
  };
  switch (status) {
    case "done":
      return <Check {...common} />;
    case "failed":
      return <X {...common} />;
    case "running":
      return (
        <Loader2
          {...common}
          className={cn(common.className, "motion-safe:animate-spin")}
        />
      );
    default:
      return <Circle {...common} />;
  }
}

function StepRow({ step }: { step: Step }) {
  return (
    <li className="flex min-h-9 items-center gap-3 py-1.5">
      <StatusIcon status={step.status} />
      <span
        className={cn(
          "flex-1 text-sm",
          step.status === "pending" ? "text-muted-foreground" : "text-foreground",
          step.status === "running" && "font-medium",
        )}
      >
        {step.label}
        {/* Status dibaca pembaca layar; ikon saja tidak cukup (jangan hanya warna/ikon). */}
        <span className="sr-only">: {patternCopy.steps.status[step.status]}</span>
      </span>
      {step.detail ? (
        <span className="tabular text-xs text-muted-foreground">{step.detail}</span>
      ) : null}
    </li>
  );
}

/**
 * Daftar langkah dengan status (menunggu/berjalan/selesai/gagal) untuk progres job.
 * Langkah selesai di awal dilipat menjadi satu baris yang bisa dibuka (doc 08 bagian 6).
 */
export function StepList({ steps, className }: { steps: Step[]; className?: string }) {
  const { done, total, collapsible, visible } = summarizeSteps(steps);

  return (
    <section
      className={cn("text-sm", className)}
      aria-label={patternCopy.steps.progress(done, total)}
    >
      {collapsible.length > 0 ? (
        <details className="group">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-3 py-1.5 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-4 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden
            />
            <span>{patternCopy.steps.collapsed(collapsible.length)}</span>
          </summary>
          <ol className="pl-0">
            {collapsible.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ol>
        </details>
      ) : null}
      <ol>
        {visible.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ol>
    </section>
  );
}
