"use client";

import { Download, ListChecks, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { exportCopy } from "@/features/export";
import type { Plan } from "@/features/plans";
import { specsCopy } from "../copy";
import { BuildProgress } from "./build-progress";
import { FeatureBuildCard } from "./feature-build-card";
import { type BuildData, useBuild } from "./use-build";

const copy = specsCopy;

/** Halaman spesifikasi & task: progres lewat SSE, lalu fitur satu per satu begitu selesai. */
export function BuildView({ plan, initial }: { plan: Plan; initial: BuildData }) {
  const {
    data,
    start,
    syncTasks,
    regenerateTasks,
    updateTask,
    removeTask,
    workingFeatureId,
  } = useBuild(plan.id, initial);
  const { build, roadmap, tasks } = data;
  const generating = build.status === "generating";
  const incomplete = new Set(build.incompleteFeatureIds);
  const stale = new Set(build.staleFeatureIds);

  // Pertama kali dibuka langsung disusun (sekali; server juga idempoten). Tidak setelah gagal.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (
      autoStarted.current ||
      initial.build.status !== "idle" ||
      initial.build.job !== null
    )
      return;
    autoStarted.current = true;
    void start();
  }, [initial.build.status, initial.build.job, start]);

  const resumable = build.status === "partial" || build.status === "failed";
  const hasAny = tasks.length > 0 || roadmap.features.some((f) => f.spec !== "");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex min-h-10 min-w-0 items-center text-sm text-muted-foreground tabular">
          {copy.title} ·{" "}
          {copy.meta(build.doneFeatures, build.totalFeatures, tasks.length)}
        </p>
        {hasAny ? (
          <div className="flex flex-wrap items-center gap-2">
            {generating ? null : (
              <Button asChild variant="secondary">
                <a
                  href={`/api/plan/export?planId=${encodeURIComponent(plan.id)}&format=zip`}
                  download
                  title={exportCopy.zipHint}
                >
                  <Download aria-hidden />
                  {exportCopy.zip}
                </a>
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link href={`/plans/${plan.id}/kanban`}>
                <ListChecks aria-hidden />
                {copy.toolbar.kanban}
              </Link>
            </Button>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" disabled={generating}>
                  <RefreshCw aria-hidden />
                  {copy.toolbar.regenerate}
                </Button>
              }
              title={copy.regenerateConfirm.title}
              body={copy.regenerateConfirm.body}
              confirm={copy.regenerateConfirm.confirm}
              cancel={copy.regenerateConfirm.cancel}
              destructive
              onConfirm={() => void start(true)}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-8 space-y-6">
        {generating && workingFeatureId === null ? (
          <BuildProgress planId={plan.id} build={build} />
        ) : null}

        {build.status === "failed" ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-negative-soft px-4 py-3"
          >
            <div className="text-sm">
              <p className="font-medium text-negative">{copy.failed.title}</p>
              <p className="mt-0.5 text-negative">
                {build.job?.error ?? copy.errors.failed}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void start()}>
              {copy.failed.retry}
            </Button>
          </div>
        ) : stale.size > 0 && !generating ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-warning-soft px-4 py-3">
            <div className="text-sm">
              <p className="font-medium">{copy.stale.title(stale.size)}</p>
              <p className="mt-0.5">{copy.stale.body}</p>
            </div>
            <Button type="button" onClick={() => void syncTasks()}>
              {copy.stale.action}
            </Button>
          </div>
        ) : build.status === "partial" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-muted px-4 py-3">
            <div className="text-sm">
              <p className="font-medium">{copy.partial.title(incomplete.size)}</p>
              <p className="mt-0.5 text-muted-foreground">{copy.partial.body}</p>
            </div>
            <Button type="button" onClick={() => void start()}>
              {copy.partial.action}
            </Button>
          </div>
        ) : null}

        {!hasAny && !generating && !resumable ? (
          <EmptyState
            icon={ListChecks}
            headingLevel={2}
            title={copy.empty.title}
            description={copy.empty.body}
            action={
              <Button type="button" onClick={() => void start()}>
                {copy.empty.action}
              </Button>
            }
          />
        ) : (
          roadmap.features.map((feature) => (
            <FeatureBuildCard
              key={feature.id}
              feature={feature}
              subFeatures={roadmap.subFeatures.filter((s) => s.parentId === feature.id)}
              tasks={tasks.filter((t) => t.featureId === feature.id)}
              complete={!incomplete.has(feature.id)}
              stale={stale.has(feature.id)}
              working={workingFeatureId === feature.id}
              disabled={generating}
              onRegenerateTasks={() => regenerateTasks(feature.id)}
              onUpdateTask={updateTask}
              onRemoveTask={removeTask}
            />
          ))
        )}
      </div>
    </div>
  );
}
