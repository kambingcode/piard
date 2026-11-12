"use client";

import { useEffect, useState } from "react";
import { StepList } from "@/components/patterns/step-list";
import { CancelJobButton } from "@/features/plans";
import { prdCopy } from "../copy";
import { prdSteps } from "../progress";
import type { PrdState } from "../schemas";

const copy = prdCopy.progress;
const SECOND_MS = 1_000;

/** Detik sejak komponen muncul; model gratis bisa diam lama, jadi waktu berjalan ikut ditampilkan. */
function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / SECOND_MS)),
      SECOND_MS,
    );
    return () => clearInterval(timer);
  }, []);
  return seconds;
}

export function PrdProgress({ planId, state }: { planId: string; state: PrdState }) {
  const seconds = useElapsedSeconds();
  return (
    <section
      aria-labelledby="prd-progress-title"
      aria-busy="true"
      className="rounded-card bg-card p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="prd-progress-title" className="text-base font-semibold">
          {state.job?.kind === "revise" ? copy.reviseTitle : copy.title}
        </h2>
        <div className="flex items-center gap-3">
          <span className="tabular text-sm text-muted-foreground">
            {copy.elapsed(seconds)}
          </span>
          <CancelJobButton planId={planId} />
        </div>
      </div>
      <StepList steps={prdSteps(state)} className="mt-3" />
      <p className="mt-2 text-sm text-muted-foreground">{copy.hint}</p>
    </section>
  );
}
