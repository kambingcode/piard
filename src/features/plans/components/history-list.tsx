"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { groupByDay } from "@/lib/day-groups";
import { plansCopy } from "../copy";
import type { Plan } from "../schemas";
import { planTitle } from "../title";
import { usePlanDeletion } from "./use-plan-deletion";

/** Riwayat plan di sidebar, dikelompokkan per hari. Hapus dengan Undo. */
export function HistoryList({ plans }: { plans: Plan[] }) {
  const pathname = usePathname();
  const { hidden, remove } = usePlanDeletion();
  const visible = plans.filter((plan) => !hidden.has(plan.id));

  if (visible.length === 0) {
    return (
      <div className="px-3">
        <p className="text-sm font-medium">{plansCopy.history.emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {plansCopy.history.emptyBody}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupByDay(visible, (plan) => new Date(plan.updatedAt)).map(({ group, items }) => (
        <section key={group} aria-label={plansCopy.history.groups[group]}>
          <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
            {plansCopy.history.groups[group]}
          </h3>
          <ul>
            {items.map((plan) => {
              const title = planTitle(plan);
              const active = pathname.startsWith(`/plans/${plan.id}`);
              return (
                <li key={plan.id} className="group relative">
                  <Link
                    href={`/plans/${plan.id}?step=${plan.step}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block min-h-11 truncate rounded-control py-2.5 pr-11 pl-3 text-sm leading-6 transition-colors",
                      active
                        ? "bg-active font-medium text-foreground"
                        : "text-muted-foreground hover:bg-active hover:text-foreground",
                    )}
                  >
                    {title}
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(plan)}
                    aria-label={plansCopy.actions.delete(title)}
                    className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-opacity hover:bg-card hover:text-negative focus-visible:opacity-100 md:size-8 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
