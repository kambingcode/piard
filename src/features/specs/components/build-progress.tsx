"use client";

import { useState } from "react";
import { StepList } from "@/components/patterns/step-list";
import { CancelJobButton } from "@/features/plans";
import { estimateRemainingMs, type ProgressMark, remainingMinutes } from "@/lib/eta";
import { useNow } from "@/lib/use-now";
import { specsCopy } from "../copy";
import { buildSteps } from "../progress";
import type { BuildState } from "../schemas";

const copy = specsCopy.progress;

/**
 * Progres job spesifikasi & task: langkah, perkiraan sisa waktu dari laju fitur yang selesai sejak
 * panel tampil, dan "Batalkan". Sebelum ada fitur yang selesai, perkiraan belum bisa dihitung.
 */
export function BuildProgress({ planId, build }: { planId: string; build: BuildState }) {
  const now = useNow();
  const [mark] = useState<ProgressMark>(() => ({
    at: Date.now(),
    done: build.doneFeatures,
  }));
  const remaining = estimateRemainingMs(
    mark,
    now,
    build.doneFeatures,
    build.totalFeatures,
  );
  return (
    <section
      aria-labelledby="build-progress-title"
      aria-busy="true"
      className="rounded-card bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="build-progress-title" className="text-base font-semibold">
          {copy.title}
        </h2>
        <div className="flex items-center gap-3">
          <span className="tabular text-sm text-muted-foreground">
            {remaining === null ? copy.etaUnknown : copy.eta(remainingMinutes(remaining))}
          </span>
          <CancelJobButton planId={planId} />
        </div>
      </div>
      <StepList steps={buildSteps(build)} className="mt-3" />
      <p className="mt-2 text-sm text-muted-foreground">{copy.hint}</p>
    </section>
  );
}
