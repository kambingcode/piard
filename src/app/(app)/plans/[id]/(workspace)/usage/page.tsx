import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { planTitle } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";
import { UsageView } from "@/features/usage";
import { getUsageService } from "@/features/usage/server";

const ROADMAP_STEP = 4;

/** `/plans/:id/usage`: token dan biaya AI per run, serta batas biaya. */
export default async function PlanUsagePage({ params }: PageProps<"/plans/[id]/usage">) {
  const user = await requireUser();
  const { id } = await params;
  const plan = getPlansService().findPlan(user.id, id);
  if (!plan) notFound();
  if (plan.step < ROADMAP_STEP) redirect(`/plans/${plan.id}?step=${plan.step}`);

  return <UsageView usage={getUsageService().getPlanUsage(user.id, plan.id)} />;
}

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]/usage">): Promise<Metadata> {
  const user = await requireUser();
  const plan = getPlansService().findPlan(user.id, (await params).id);
  return { title: plan ? `Pemakaian · ${planTitle(plan)}` : "Pemakaian" };
}
