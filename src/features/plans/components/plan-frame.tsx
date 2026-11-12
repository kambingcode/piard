import type { ReactNode } from "react";
import type { Plan } from "../schemas";
import { planTitle } from "../title";
import { PlanNav, type PlanView } from "./plan-nav";

/**
 * Kerangka bersama tab plan (Struktur, PRD, task, kanban, pemakaian): lebar, bilah tab, dan judul
 * sama persis di semua tab agar tidak bergeser saat berpindah. Tab tidak menambah `max-w` sendiri.
 */
export function PlanFrame({
  plan,
  current,
  children,
}: {
  plan: Plan;
  /** Kosong bila dirender dari layout: tab aktif diturunkan dari segmen route. */
  current?: PlanView;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PlanNav planId={plan.id} current={current} />
      <h1 className="mt-6 line-clamp-2 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance">
        {planTitle(plan)}
      </h1>
      <div className="mt-1">{children}</div>
    </div>
  );
}
