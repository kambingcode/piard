"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { roadmapCopy } from "../copy";
import type { RoadmapFeature, RoadmapSubFeature } from "../schemas";
import { FeatureIcon } from "./feature-icon";

type Props = {
  features: RoadmapFeature[];
  subFeatures: RoadmapSubFeature[];
  selectedId: string | null;
  onOpen: (featureId: string) => void;
};

/**
 * Roadmap sebagai daftar bertingkat per fase: tampilan utama di ponsel (doc 08 bagian 6) dan
 * alternatif graf yang bisa dibaca pembaca layar dan papan ketik.
 */
export function RoadmapList({ features, subFeatures, selectedId, onOpen }: Props) {
  const phases = [...new Set(features.map((f) => f.phase ?? 0))].sort((a, b) => a - b);
  return (
    <section aria-label={roadmapCopy.list.label} className="space-y-8">
      {phases.map((phase) => (
        <section key={phase} aria-labelledby={`phase-${phase}`}>
          <h3
            id={`phase-${phase}`}
            className="text-sm font-semibold text-muted-foreground"
          >
            {roadmapCopy.graph.phase(phase)}
          </h3>
          <ul className="mt-3 space-y-2">
            {features
              .filter((f) => (f.phase ?? 0) === phase)
              .map((feature) => {
                const subs = subFeatures.filter((s) => s.parentId === feature.id);
                return (
                  <li key={feature.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(feature.id)}
                      className={cn(
                        "w-full cursor-pointer rounded-control border bg-card p-4 text-left",
                        "transition-[border-color] duration-150",
                        selectedId === feature.id
                          ? "border-accent"
                          : "border-border hover:border-control-border",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <FeatureIcon icon={feature.icon} name={feature.name} />
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {feature.name}
                        </span>
                        <span className="text-xs text-muted-foreground tabular">
                          {roadmapCopy.list.subCount(subs.length)}
                        </span>
                        <ChevronRight
                          className="size-4 text-muted-foreground"
                          aria-hidden
                        />
                      </span>
                      {feature.summary ? (
                        <span className="mt-1.5 block text-sm text-muted-foreground">
                          {feature.summary}
                        </span>
                      ) : null}
                      {subs.length > 0 ? (
                        <span className="mt-3 flex flex-wrap gap-1.5">
                          {subs.map((sub) => (
                            <span
                              key={sub.id}
                              className="rounded-chip bg-muted px-2 py-1 text-xs"
                            >
                              {sub.name}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </section>
  );
}
