import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { getCodebaseService } from "@/features/codebase/server";
import {
  IdeaStep,
  planTitle,
  resolveStep,
  TechPrefsStep,
  WizardShell,
} from "@/features/plans";
import { getPlansService } from "@/features/plans/server";
import { QuestionStep } from "@/features/questions";
import { RoadmapStep } from "@/features/roadmap";
import { getRoadmapService } from "@/features/roadmap/server";

const STEP_IDEA = 1;
const STEP_TECH = 2;
const STEP_QUESTIONS = 3;

/** Wizard `/plans/:id?step=N`. Langkah di luar yang sudah dicapai dialihkan ke langkah terjauh. */
export default async function PlanWizardPage({
  params,
  searchParams,
}: PageProps<"/plans/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { step: requested } = await searchParams;

  const plan = getPlansService().findPlan(user.id, id);
  if (!plan) notFound();

  const requestedStep = typeof requested === "string" ? requested : undefined;
  const step = resolveStep(requestedStep, plan.step);
  if (requestedStep !== String(step)) redirect(`/plans/${plan.id}?step=${step}`);

  // Plan fitur baru dari proyek eksisting (M7-18); proyek yang sudah dihapus tidak ditautkan.
  const codebase = plan.codebaseId
    ? getCodebaseService().find(user.id, plan.codebaseId)
    : undefined;
  const source = codebase ? { id: codebase.id, name: codebase.name } : undefined;
  // Dikunci hanya bila ada teknologi yang benar-benar terdeteksi; tanpa itu kunci tidak berguna.
  const detected =
    codebase &&
    (["frontend", "backend", "database", "deployment"] as const).some(
      (area) => codebase.detectedStack[area],
    );

  return (
    <WizardShell plan={plan} step={step} codebase={source}>
      {step === STEP_IDEA ? (
        <IdeaStep plan={plan} />
      ) : step === STEP_TECH ? (
        <TechPrefsStep plan={plan} lockedFrom={detected ? source?.name : undefined} />
      ) : step === STEP_QUESTIONS ? (
        <QuestionStep plan={plan} />
      ) : (
        <RoadmapStep
          plan={plan}
          initial={getRoadmapService().getRoadmap(user.id, plan.id)}
        />
      )}
    </WizardShell>
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/plans/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const plan = getPlansService().findPlan(user.id, (await params).id);
  return { title: plan ? planTitle(plan) : "Rencana" };
}
