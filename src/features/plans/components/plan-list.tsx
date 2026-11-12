"use client";

import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { plansCopy } from "../copy";
import { MAX_STEP, type Plan } from "../schemas";
import { planTitle } from "../title";
import { stepName } from "../wizard";
import { NEW_PLAN_HREF } from "./plan-landing";
import { usePlanDeletion } from "./use-plan-deletion";

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Halaman /plans: semua plan, terbaru dulu, dengan hapus + Undo. */
export function PlanList({ plans }: { plans: Plan[] }) {
  const copy = plansCopy.list;
  const { hidden, remove } = usePlanDeletion();
  const visible = plans.filter((plan) => !hidden.has(plan.id));

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
          {copy.title}
        </h1>
        <Button asChild size="sm">
          <Link href={NEW_PLAN_HREF}>{plansCopy.actions.newPlan}</Link>
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={FileText}
          title={copy.empty.title}
          description={copy.empty.body}
          action={
            <Button asChild variant="secondary">
              <Link href={NEW_PLAN_HREF}>{copy.empty.action}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-card border border-border bg-card">
          {visible.map((plan) => {
            const title = planTitle(plan);
            return (
              <li key={plan.id} className="flex items-center gap-2 pr-2">
                <Link
                  href={`/plans/${plan.id}?step=${plan.step}`}
                  className="flex min-h-16 min-w-0 flex-1 flex-col justify-center rounded-card px-5 py-3 transition-colors hover:bg-muted"
                >
                  <span className="truncate text-base font-medium">{title}</span>
                  <span className="mt-0.5 text-sm text-muted-foreground tabular">
                    {copy.stepLabel(plan.step, MAX_STEP, stepName(plan.step))} ·{" "}
                    {dateFormat.format(new Date(plan.updatedAt))}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => remove(plan)}
                  aria-label={plansCopy.actions.delete(title)}
                  className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-negative md:size-9"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
