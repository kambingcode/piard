import type { Step, StepStatus } from "@/lib/steps";
import { prdCopy } from "./copy";
import type { PrdState } from "./schemas";
import { PRD_SECTION_COUNT } from "./structure";

const copy = prdCopy.progress;

type Stage = "thinking" | "writing" | "saving" | "done";
const ORDER: Stage[] = ["thinking", "writing", "saving", "done"];

/** Tahap tampilan dari job: sebelum judul bagian pertama muncul, model masih berpikir. */
function stageOf(state: PrdState): Stage {
  const job = state.job;
  if (!job || job.phase === "queued") return "thinking";
  if (job.phase === "writing") return job.sections > 0 ? "writing" : "thinking";
  return job.phase;
}

function statusFor(step: Stage, current: Stage, failed: boolean): StepStatus {
  const at = ORDER.indexOf(current);
  const index = ORDER.indexOf(step);
  if (index < at) return "done";
  if (index === at) return failed ? "failed" : "running";
  return "pending";
}

/** Langkah progres nyata dari job PRD (doc 08 bagian 6), bukan pemintal kosong. */
export function prdSteps(state: PrdState): Step[] {
  const failed = state.status === "failed";
  const stage = stageOf(state);
  const sections = state.job?.sections ?? 0;
  return [
    {
      id: "thinking",
      label: copy.steps.thinking,
      status: statusFor("thinking", stage, failed),
      detail: state.job?.phase === "queued" && !failed ? copy.queued : undefined,
    },
    {
      id: "writing",
      label: copy.steps.writing,
      status: statusFor("writing", stage, failed),
      detail: sections > 0 ? copy.sections(sections, PRD_SECTION_COUNT) : undefined,
    },
    {
      id: "saving",
      label: copy.steps.saving,
      status: statusFor("saving", stage, failed),
    },
  ];
}
