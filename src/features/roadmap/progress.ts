import type { Step, StepStatus } from "@/lib/steps";
import { roadmapCopy } from "./copy";
import type { RoadmapPhase, RoadmapState } from "./schemas";

const copy = roadmapCopy.progress;

/** Urutan fase job; fase sebelum fase berjalan dianggap selesai. */
const ORDER: RoadmapPhase[] = ["queued", "reading", "features", "finishing", "done"];

function statusFor(
  step: RoadmapPhase,
  current: RoadmapPhase,
  failed: boolean,
): StepStatus {
  const at = ORDER.indexOf(current);
  const index = ORDER.indexOf(step);
  if (index < at) return "done";
  if (index === at) return failed ? "failed" : "running";
  return "pending";
}

/** Langkah progres nyata dari job (doc 08 bagian 6), bukan pemintal kosong. */
export function roadmapSteps(state: RoadmapState): Step[] {
  const failed = state.status === "failed";
  // "queued" belum mulai membaca: tampilkan sebagai langkah pertama yang menunggu giliran.
  const phase =
    state.job?.phase === "queued" ? "reading" : (state.job?.phase ?? "reading");
  const count = state.features.length;
  return [
    {
      id: "reading",
      label: copy.steps.reading,
      status: statusFor("reading", phase, failed),
      detail: state.job?.phase === "queued" && !failed ? copy.queued : undefined,
    },
    {
      id: "features",
      label: copy.steps.features,
      status: statusFor("features", phase, failed),
      detail: count > 0 ? copy.featureCount(count) : undefined,
    },
    {
      id: "finishing",
      label: copy.steps.finishing,
      status: statusFor("finishing", phase, failed),
    },
  ];
}
