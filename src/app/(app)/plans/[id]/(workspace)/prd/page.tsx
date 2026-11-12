import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { planTitle } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";
import { getPrdService } from "@/features/prd/server";
import { PrdWorkspace } from "@/features/revision";
import { getRevisionService } from "@/features/revision/server";

const ROADMAP_STEP = 4;

/** `/plans/:id/prd`. Plan yang belum sampai langkah roadmap dialihkan ke wizard. */
export default async function PlanPrdPage({ params }: PageProps<"/plans/[id]/prd">) {
  const user = await requireUser();
  const { id } = await params;
  const plan = getPlansService().findPlan(user.id, id);
  if (!plan) notFound();
  if (plan.step < ROADMAP_STEP) redirect(`/plans/${plan.id}?step=${plan.step}`);

  const revision = getRevisionService();
  return (
    <PrdWorkspace
      plan={plan}
      initial={getPrdService().getPrd(user.id, plan.id)}
      revision={{
        messages: revision.listMessages(user.id, plan.id),
        sync: revision.getSyncStatus(user.id, plan.id),
      }}
    />
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]/prd">): Promise<Metadata> {
  const user = await requireUser();
  const plan = getPlansService().findPlan(user.id, (await params).id);
  return { title: plan ? `PRD · ${planTitle(plan)}` : "PRD" };
}
