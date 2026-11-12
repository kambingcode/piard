import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { plansCopy } from "../copy";
import { MAX_STEP, type Plan } from "../schemas";
import { planTitle } from "../title";
import { stepName, WIZARD_STEPS } from "../wizard";
import { PlanFrame } from "./plan-frame";

/**
 * Penanda langkah. Langkah yang sudah dicapai berupa tautan (bisa kembali tanpa kehilangan
 * isian); yang belum dicapai tidak bisa dibuka. Status tidak hanya warna: ada ikon centang dan
 * `aria-current="step"`.
 */
function Stepper({ plan, current }: { plan: Plan; current: number }) {
  return (
    <nav aria-label={plansCopy.wizard.stepperLabel}>
      <ol className="grid grid-cols-4 gap-2">
        {WIZARD_STEPS.map((step) => {
          const reachable = step <= plan.step;
          const done = step < current;
          const isCurrent = step === current;
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  "block h-1 rounded-full",
                  isCurrent || done
                    ? "bg-foreground"
                    : reachable
                      ? "bg-control-border"
                      : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "mt-2 flex items-center gap-1 text-xs",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                <span className="truncate">{stepName(step)}</span>
              </span>
            </>
          );
          return (
            <li key={step} aria-current={isCurrent ? "step" : undefined}>
              {reachable ? (
                <Link
                  href={`/plans/${plan.id}?step=${step}`}
                  className="block rounded-chip py-1 transition-opacity hover:opacity-80"
                >
                  {content}
                </Link>
              ) : (
                <div className="py-1 opacity-60">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CodebaseLink({ codebase }: { codebase: { id: string; name: string } }) {
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {plansCopy.wizard.fromCodebase}{" "}
      <Link
        href={`/codebases/${codebase.id}`}
        className="font-medium text-accent underline-offset-4 hover:underline"
      >
        {codebase.name}
      </Link>
    </p>
  );
}

/**
 * Kerangka halaman wizard: judul plan, penanda langkah, lalu isi langkah. Langkah terakhir
 * (Struktur) sudah menjadi tab plan, jadi memakai `PlanFrame` yang sama dengan tab lain; penanda
 * langkah tetap ada di isinya agar langkah 1–3 masih bisa dibuka.
 */
export function WizardShell({
  plan,
  step,
  codebase,
  children,
}: {
  plan: Plan;
  step: number;
  /** Proyek eksisting asal plan fitur baru (M7-18): ditautkan di bawah judul. */
  codebase?: { id: string; name: string };
  children: ReactNode;
}) {
  if (step === MAX_STEP)
    return (
      <PlanFrame plan={plan} current="roadmap">
        {codebase ? <CodebaseLink codebase={codebase} /> : null}
        <div className="mt-6 max-w-[720px]">
          <Stepper plan={plan} current={step} />
        </div>
        <div className="mt-8">{children}</div>
      </PlanFrame>
    );

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <p className="text-sm text-muted-foreground tabular">
        {plansCopy.wizard.stepOf(step, MAX_STEP)}
      </p>
      <h1 className="mt-1 line-clamp-2 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance">
        {planTitle(plan)}
      </h1>
      {codebase ? <CodebaseLink codebase={codebase} /> : null}
      <div className="mt-6">
        <Stepper plan={plan} current={step} />
      </div>
      <div className="mt-10">{children}</div>
    </div>
  );
}
