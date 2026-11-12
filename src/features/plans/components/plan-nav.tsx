"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { plansCopy } from "../copy";

const copy = plansCopy.planNav;
const ROADMAP_STEP = 4;

export type PlanView = "roadmap" | "prd" | "tasks" | "kanban" | "usage";

const VIEWS: { view: PlanView; href: (id: string) => string }[] = [
  { view: "roadmap", href: (id) => `/plans/${id}?step=${ROADMAP_STEP}` },
  { view: "prd", href: (id) => `/plans/${id}/prd` },
  { view: "tasks", href: (id) => `/plans/${id}/tasks` },
  { view: "kanban", href: (id) => `/plans/${id}/kanban` },
  { view: "usage", href: (id) => `/plans/${id}/usage` },
];

/**
 * Tab antarbagian plan setelah wizard: struktur, PRD, spesifikasi & task, kanban, pemakaian AI.
 * Tanpa `current`, tab aktif diambil dari segmen di bawah layout (`prd`, `tasks`, ...).
 */
export function PlanNav({ planId, current }: { planId: string; current?: PlanView }) {
  const segment = useSelectedLayoutSegment();
  const active = current ?? VIEWS.find(({ view }) => view === segment)?.view;
  const activeRef = useRef<HTMLAnchorElement>(null);
  // Di ponsel bilah tab bisa digeser; tab aktif (mis. "Pemakaian" di ujung) digulir ke tampilan.
  // Bergantung pada `active`: di layout bersama bilah ini tidak di-mount ulang saat pindah tab.
  useEffect(() => {
    if (active)
      activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <nav aria-label={copy.label} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 px-1">
        {VIEWS.map(({ view, href }) => (
          <li key={view}>
            <Link
              href={href(planId)}
              ref={view === active ? activeRef : undefined}
              aria-current={view === active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-3.5 text-sm transition-colors duration-150 md:min-h-9",
                view === active
                  ? "bg-active font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {copy[view]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
