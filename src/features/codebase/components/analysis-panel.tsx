"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { StepList } from "@/components/patterns/step-list";
import { Button } from "@/components/ui/button";
import type { Step } from "@/lib/steps";
import { useEventSource } from "@/lib/use-event-source";
import { codebaseCopy } from "../copy";
import type { AnalysisEstimate, AnalysisPhase, AnalysisStatus } from "../schemas";
import { codebaseApi, streamHref } from "./codebase-api";

const copy = codebaseCopy.ui.status;
const STEP_PHASES = ["profile", "summarize", "pages"] as const;

const count = (n: number) => n.toLocaleString("id-ID");
const usd = (n: number) => n.toFixed(n < 0.1 ? 3 : 2).replace(".", ",");

/**
 * Langkah progres dari fase job: langkah sebelum fase berjalan = selesai, fase berjalan = berjalan
 * (atau gagal), sesudahnya = menunggu. Antre = semua menunggu; `done` = semua selesai.
 */
export function analysisSteps(status: AnalysisStatus): Step[] {
  const job = status.job;
  const phase: AnalysisPhase = job?.phase ?? "queued";
  const current =
    phase === "queued"
      ? -1
      : phase === "done"
        ? STEP_PHASES.length
        : STEP_PHASES.indexOf(phase);
  const failed = status.status === "failed";
  return STEP_PHASES.map((step, i): Step => {
    const state: Step["status"] =
      i < current ? "done" : i === current ? (failed ? "failed" : "running") : "pending";
    const showCount = i === current && job && job.total > 1 && step !== "profile";
    return {
      id: step,
      label: copy.steps[step],
      status: state,
      detail: showCount ? copy.phaseCount(job.done, job.total) : undefined,
    };
  });
}

function EstimateCard({ estimate }: { estimate: AnalysisEstimate }) {
  return (
    <div className="rounded-card bg-muted px-5 py-4 text-sm">
      <p className="font-medium">{copy.estimateTitle}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular">
        {estimate.costUsd === null
          ? copy.estimateUnknown
          : copy.estimateCost(usd(estimate.costUsd))}
      </p>
      <p className="mt-1 text-muted-foreground">
        {copy.estimate(estimate.files, estimate.calls)} ·{" "}
        {copy.estimateTokens(count(estimate.inputTokens), count(estimate.outputTokens))}
      </p>
      {estimate.truncatedFiles + estimate.droppedFiles > 0 ? (
        <p className="mt-1 text-muted-foreground">
          {copy.truncated(estimate.truncatedFiles, estimate.droppedFiles)}
        </p>
      ) : null}
      <p className="mt-1 text-muted-foreground">{copy.estimateNote(estimate.model)}</p>
    </div>
  );
}

/**
 * Analisis server (M7-12, M7-13): perkiraan biaya dan tombol mulai (dengan konfirmasi di atas
 * ambang), progres real-time lewat SSE, serta keadaan gagal dengan "Coba lagi" dan "Batalkan".
 * Saat status berubah, halaman dimuat ulang dari server agar dokumentasi baru tampil.
 */
export function AnalysisPanel({
  codebaseId,
  initial,
  estimate,
  estimateError,
}: {
  codebaseId: string;
  initial: AnalysisStatus;
  estimate: AnalysisEstimate | null;
  estimateError: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<"start" | "retry" | "cancel" | null>(null);
  const seen = useRef(`${initial.status}:${initial.job?.done ?? 0}`);
  const live = status.status === "analyzing";

  useEffect(() => setStatus(initial), [initial]);

  useEventSource<{ status: AnalysisStatus }>(live ? streamHref(codebaseId) : null, {
    status: (next) => {
      setStatus(next);
      // Muat ulang saat status atau jumlah halaman berubah (bukan hanya saat transisi terlihat):
      // job mock bisa selesai sebelum klien sempat melihat "menganalisis".
      const key = `${next.status}:${next.job?.phase === "pages" ? next.job.done : 0}`;
      if (key !== seen.current) {
        seen.current = key;
        router.refresh();
      }
    },
  });

  async function run(kind: "start" | "retry" | "cancel") {
    setBusy(kind);
    const result =
      kind === "start"
        ? await codebaseApi.start(codebaseId, true)
        : kind === "retry"
          ? await codebaseApi.retry(codebaseId)
          : await codebaseApi.cancel(codebaseId);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error.error);
      router.refresh();
      return;
    }
    if (kind !== "cancel") setStatus((s) => ({ ...s, status: "analyzing", error: null }));
    router.refresh();
  }

  if (status.status === "analyzing") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium" aria-live="polite">
          {copy.analyzing}
        </p>
        <StepList steps={analysisSteps(status)} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => void run("cancel")}
          disabled={busy !== null}
        >
          {busy === "cancel" ? copy.cancelling : copy.cancel}
        </Button>
      </div>
    );
  }

  if (status.status === "failed") {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="flex gap-3 rounded-card bg-negative-soft px-5 py-4 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
          <div>
            <p className="font-medium">{copy.failed}</p>
            {status.error ? <p className="mt-1">{status.error}</p> : null}
          </div>
        </div>
        {status.job ? <StepList steps={analysisSteps(status)} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void run("retry")}
            disabled={busy !== null}
          >
            {busy === "retry" ? copy.retrying : copy.retry}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void run("cancel")}
            disabled={busy !== null}
          >
            {busy === "cancel" ? copy.cancelling : copy.cancel}
          </Button>
        </div>
      </div>
    );
  }

  // source_ready: perkiraan biaya dan mulai.
  if (!estimate) {
    return (
      <p className="text-sm text-muted-foreground">{estimateError ?? copy.expired}</p>
    );
  }
  const startButton = (
    <Button type="button" disabled={busy !== null}>
      {busy === "start" ? copy.starting : copy.start}
    </Button>
  );
  return (
    <div className="space-y-4">
      <EstimateCard estimate={estimate} />
      {estimate.needsConfirmation ? (
        <ConfirmDialog
          trigger={startButton}
          title={copy.confirmTitle}
          body={estimate.reasons.map((r) => r.message).join(" ")}
          confirm={copy.confirmAction}
          cancel={copy.confirmCancel}
          onConfirm={() => void run("start")}
        />
      ) : (
        <Button type="button" onClick={() => void run("start")} disabled={busy !== null}>
          {busy === "start" ? copy.starting : copy.start}
        </Button>
      )}
    </div>
  );
}
