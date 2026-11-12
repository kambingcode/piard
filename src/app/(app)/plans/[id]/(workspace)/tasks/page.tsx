import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { planTitle } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";
import { getRoadmapService } from "@/features/roadmap/server";
import { BuildView } from "@/features/specs";
import { getSpecsService } from "@/features/specs/server";
import { getTasksService } from "@/features/tasks/server";

const ROADMAP_STEP = 4;

/** `/plans/:id/tasks`: spesifikasi per fitur dan task siap tempel. */
export default async function PlanTasksPage({ params }: PageProps<"/plans/[id]/tasks">) {
  const user = await requireUser();
  const { id } = await params;
  const plan = getPlansService().findPlan(user.id, id);
  if (!plan) notFound();
  if (plan.step < ROADMAP_STEP) redirect(`/plans/${plan.id}?step=${plan.step}`);

  const roadmap = getRoadmapService().getRoadmap(user.id, plan.id);
  return (
    <BuildView
      plan={plan}
      initial={{
        build: getSpecsService().getBuild(user.id, plan.id),
        roadmap: { features: roadmap.features, subFeatures: roadmap.subFeatures },
        tasks: getTasksService().listTasks(user.id, plan.id),
      }}
    />
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]/tasks">): Promise<Metadata> {
  const user = await requireUser();
  const plan = getPlansService().findPlan(user.id, (await params).id);
  return { title: plan ? `Task · ${planTitle(plan)}` : "Task" };
}
