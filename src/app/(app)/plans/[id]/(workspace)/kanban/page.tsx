import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AgentKanban } from "@/features/agent-bridge";
import { agentConnection } from "@/features/agent-bridge/server";
import { requireUser } from "@/features/auth/server";
import { planTitle } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";
import { getRoadmapService } from "@/features/roadmap/server";
import { getTasksService } from "@/features/tasks/server";

const ROADMAP_STEP = 4;

/** Origin yang sedang dibuka pengguna (untuk cuplikan "Hubungkan AI" bila `APP_URL` kosong). */
async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto =
    list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** `/plans/:id/kanban`: task plan per status, dengan jembatan agen (M8). */
export default async function PlanKanbanPage({
  params,
}: PageProps<"/plans/[id]/kanban">) {
  const user = await requireUser();
  const { id } = await params;
  const plan = getPlansService().findPlan(user.id, id);
  if (!plan) notFound();
  if (plan.step < ROADMAP_STEP) redirect(`/plans/${plan.id}?step=${plan.step}`);

  const features = getRoadmapService()
    .getRoadmap(user.id, plan.id)
    .features.map((f) => ({ id: f.id, name: f.name }));
  return (
    <AgentKanban
      plan={plan}
      initial={getTasksService().listTasks(user.id, plan.id)}
      features={features}
      connection={agentConnection(await requestOrigin())}
    />
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]/kanban">): Promise<Metadata> {
  const user = await requireUser();
  const plan = getPlansService().findPlan(user.id, (await params).id);
  return { title: plan ? `Kanban · ${planTitle(plan)}` : "Kanban" };
}
