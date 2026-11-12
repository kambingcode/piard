import type { Step, StepStatus } from "@/lib/steps";
import { specsCopy } from "./copy";
import type { BuildPhase, BuildState } from "./schemas";

const copy = specsCopy.progress;
const ORDER: BuildPhase[] = ["queued", "reading", "features", "enrich", "done"];

function statusFor(step: BuildPhase, current: BuildPhase, failed: boolean): StepStatus {
  const at = ORDER.indexOf(current);
  const index = ORDER.indexOf(step);
  if (index < at) return "done";
  if (index === at) return failed ? "failed" : "running";
  return "pending";
}

/**
 * Langkah progres situs acuan: Membaca PRD → Menyusun fitur & sub-fitur → Menyusun spesifikasi &
 * task (n/total). "queued" ditampilkan sebagai langkah pertama yang menunggu giliran.
 */
export function buildSteps(state: BuildState): Step[] {
  const failed = state.status === "failed";
  const raw = state.job?.phase ?? "reading";
  const phase = raw === "queued" ? "reading" : raw;
  return [
    {
      id: "reading",
      label: copy.steps.reading,
      status: statusFor("reading", phase, failed),
      detail: raw === "queued" && !failed ? copy.queued : undefined,
    },
    {
      id: "features",
      label: copy.steps.features,
      status: statusFor("features", phase, failed),
    },
    {
      id: "enrich",
      label: copy.steps.enrich,
      status: statusFor("enrich", phase, failed),
      detail: copy.count(state.doneFeatures, state.totalFeatures),
    },
  ];
}
