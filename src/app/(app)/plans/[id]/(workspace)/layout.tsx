import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { PlanFrame } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";

/**
 * Kerangka tab plan (PRD, task, kanban, pemakaian): bilah tab dan judul dirender sekali di sini
 * sehingga tetap di tempat saat berpindah tab. Penjaga langkah wizard tetap di tiap page karena
 * layout tidak dirender ulang pada navigasi klien.
 */
export default async function PlanWorkspaceLayout({
  children,
  params,
}: LayoutProps<"/plans/[id]">) {
  const user = await requireUser();
  const plan = getPlansService().findPlan(user.id, (await params).id);
  if (!plan) notFound();
  return <PlanFrame plan={plan}>{children}</PlanFrame>;
}
