import { StepList } from "@/components/patterns/step-list";
import { CancelJobButton } from "@/features/plans";
import { roadmapCopy } from "../copy";
import { roadmapSteps } from "../progress";
import type { RoadmapState } from "../schemas";

const copy = roadmapCopy.progress;

export function RoadmapProgress({
  planId,
  state,
}: {
  planId: string;
  state: RoadmapState;
}) {
  return (
    <section
      aria-labelledby="roadmap-progress-title"
      aria-busy="true"
      className="rounded-card bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="roadmap-progress-title" className="text-base font-semibold">
          {copy.title}
        </h3>
        <CancelJobButton planId={planId} />
      </div>
      <StepList steps={roadmapSteps(state)} className="mt-3" />
      <p className="mt-2 text-sm text-muted-foreground">{copy.hint}</p>
    </section>
  );
}
