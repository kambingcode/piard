"use client";

import { ArrowRight, Network, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { type Plan, planTitle } from "@/features/plans";
import { cn } from "@/lib/cn";
import { roadmapCopy } from "../copy";
import type { RoadmapState } from "../schemas";
import { FeaturePanel } from "./feature-panel";
import { RegenerateDialog } from "./regenerate-dialog";
import { RoadmapGraph } from "./roadmap-graph";
import { RoadmapList } from "./roadmap-list";
import { RoadmapProgress } from "./roadmap-progress";
import { useRoadmap } from "./use-roadmap";

const copy = roadmapCopy;
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True di layar lebar setelah hidrasi. Server dan ponsel memakai daftar, sehingga React Flow
 * tidak pernah dirender tanpa ukuran (dan tidak ada beda markup saat hidrasi).
 */
function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

type View = "graph" | "list";

function ViewToggle({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <fieldset className="flex rounded-full bg-muted p-1">
      <legend className="sr-only">{copy.toolbar.viewLabel}</legend>
      {(["graph", "list"] as const).map((value) => (
        <label
          key={value}
          className={cn(
            "cursor-pointer rounded-full px-3 py-1 text-sm transition-colors duration-150",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
            view === value
              ? "bg-card font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name="roadmap-view"
            className="sr-only"
            checked={view === value}
            onChange={() => onChange(value)}
          />
          {copy.toolbar[value]}
        </label>
      ))}
    </fieldset>
  );
}

/** Langkah 4: membuat roadmap bila belum ada, menampilkan progres, lalu graf/daftar yang bisa diedit. */
export function RoadmapStep({ plan, initial }: { plan: Plan; initial: RoadmapState }) {
  const controller = useRoadmap(plan.id, initial);
  const { state, features, subFeatures, editable, start, patchFeature, addFeature } =
    controller;
  const desktop = useDesktop();
  const [view, setView] = useState<View>("graph");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Plan yang baru sampai di langkah 4 langsung dibuatkan roadmap (sekali; server juga idempoten).
  // Hanya bila belum pernah ada job: roadmap yang sengaja dikosongkan pengguna tidak dibuat ulang diam-diam.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || initial.status !== "idle" || initial.job !== null) return;
    autoStarted.current = true;
    void start();
  }, [initial.status, initial.job, start]);

  const rename = useCallback(
    (id: string, name: string) => {
      patchFeature(id, { name }).catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : copy.saveFailed),
      );
    },
    [patchFeature],
  );
  // Selama job berjalan fitur belum bisa diubah; klik tidak boleh membuka panel belakangan.
  const open = useCallback(
    (id: string) => {
      if (editable) setSelectedId(id);
    },
    [editable],
  );

  const generating = state.status === "generating";
  const selected = features.find((f) => f.id === selectedId);
  const showGraph = desktop && view === "graph";
  const empty = features.length === 0 && !generating && state.status !== "failed";

  return (
    <section aria-labelledby="roadmap-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="roadmap-title" className="text-xl font-semibold tracking-tight">
            {copy.title}
          </h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
            {copy.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {desktop ? <ViewToggle view={view} onChange={setView} /> : null}
          <Button
            type="button"
            variant="secondary"
            disabled={!editable || adding}
            onClick={async () => {
              setAdding(true);
              const feature = await addFeature();
              setAdding(false);
              if (feature) setSelectedId(feature.id);
            }}
          >
            <Plus aria-hidden />
            {copy.toolbar.addFeature}
          </Button>
          <RegenerateDialog disabled={!editable} onConfirm={() => void start(true)} />
        </div>
      </div>

      {generating ? <RoadmapProgress planId={plan.id} state={state} /> : null}

      {state.status === "failed" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-negative-soft px-4 py-3"
        >
          <div className="text-sm">
            <p className="font-medium text-negative">{copy.failed.title}</p>
            <p className="mt-0.5 text-negative">
              {state.job?.error ?? copy.errors.failed}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void start()}>
            {copy.failed.retry}
          </Button>
        </div>
      ) : null}

      {empty ? (
        <EmptyState
          icon={Network}
          title={copy.empty.title}
          description={copy.empty.body}
          action={
            <Button type="button" onClick={() => void start()}>
              {copy.empty.action}
            </Button>
          }
        />
      ) : showGraph ? (
        <RoadmapGraph
          title={state.title ?? planTitle(plan)}
          features={features}
          subFeatures={subFeatures}
          selectedId={selectedId}
          editable={editable}
          onOpen={open}
          onRename={rename}
        />
      ) : (
        <RoadmapList
          features={features}
          subFeatures={subFeatures}
          selectedId={selectedId}
          onOpen={open}
        />
      )}

      {state.status === "ready" && features.length > 0 ? (
        <div className="flex justify-end">
          <Button asChild>
            <Link href={`/plans/${plan.id}/prd`}>
              {copy.toolbar.next}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}

      <FeaturePanel
        feature={editable ? selected : undefined}
        subFeatures={subFeatures.filter((s) => s.parentId === selectedId)}
        controller={controller}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}
