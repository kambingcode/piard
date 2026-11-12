"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { FileText, Layers, Pencil } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { cn } from "@/lib/cn";
import { roadmapCopy } from "../copy";
import { LAYOUT } from "../layout";
import { NAME_MAX_LENGTH, type RoadmapFeature, type RoadmapSubFeature } from "../schemas";
import { FeatureIcon } from "./feature-icon";

const copy = roadmapCopy.graph;

// Node tidak bisa dipilih/diseret, jadi React Flow memberi `pointer-events: none` pada pembungkusnya;
// setiap node mengaktifkannya lagi (`pointer-events-auto`) agar tombol di dalamnya bisa diklik.

/** Titik sambung tak terlihat: graf tidak bisa disambung ulang oleh pengguna. */
function Anchor({ type }: { type: "source" | "target" }) {
  return (
    <Handle
      type={type}
      position={type === "source" ? Position.Right : Position.Left}
      isConnectable={false}
      className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-control-border"
    />
  );
}

export type PrdNodeData = { title: string };
export type PrdNode = Node<PrdNodeData, "prd">;

export function PrdNodeView({ data }: NodeProps<PrdNode>) {
  return (
    <div
      className="pointer-events-auto flex h-full items-center gap-3 rounded-control border border-border bg-card px-4"
      style={{ width: LAYOUT.prdWidth }}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{data.title}</p>
        <p className="text-xs text-muted-foreground">{copy.prdStatus}</p>
      </div>
      <Anchor type="source" />
    </div>
  );
}

export type FeatureNodeData = {
  feature: RoadmapFeature;
  selected: boolean;
  editable: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
};
export type FeatureNode = Node<FeatureNodeData, "feature">;

/** Kartu fitur: klik membuka panel detail; pensil mengganti nama langsung di node. */
export function FeatureNodeView({ data }: NodeProps<FeatureNode>) {
  const { feature, selected, editable, onOpen, onRename } = data;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(feature.name);

  function commit() {
    const name = draft.trim();
    setRenaming(false);
    if (name && name !== feature.name) onRename(feature.id, name);
    else setDraft(feature.name);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") {
      setDraft(feature.name);
      setRenaming(false);
    }
  }

  return (
    <div
      className={cn(
        "group pointer-events-auto relative flex h-full flex-col justify-center rounded-control border bg-card px-3.5",
        "transition-[border-color] duration-150",
        selected ? "border-accent" : "border-border hover:border-control-border",
      )}
      style={{ width: LAYOUT.featureWidth }}
    >
      <Anchor type="target" />
      {renaming ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: mode ganti nama dibuka atas permintaan pengguna
          autoFocus
          aria-label={copy.rename(feature.name)}
          className="nodrag h-8 w-full rounded-chip border border-control-border bg-background px-2 text-sm font-medium"
          maxLength={NAME_MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      ) : (
        <>
          <button
            type="button"
            aria-label={copy.open(feature.name)}
            className="absolute inset-0 cursor-pointer rounded-control"
            onClick={() => onOpen(feature.id)}
          />
          <div className="pointer-events-none flex items-center gap-2">
            <FeatureIcon icon={feature.icon} name={feature.name} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {feature.name}
            </span>
            {feature.phase ? (
              <span className="shrink-0 rounded-chip bg-muted px-1.5 py-0.5 text-xs tabular text-muted-foreground">
                {copy.phase(feature.phase)}
              </span>
            ) : null}
          </div>
          <p className="pointer-events-none mt-1 pl-6 text-xs text-muted-foreground">
            {roadmapCopy.status[feature.status]}
          </p>
          {editable ? (
            <button
              type="button"
              aria-label={copy.rename(feature.name)}
              className={cn(
                "absolute right-1.5 bottom-1.5 flex size-7 cursor-pointer items-center justify-center rounded-chip",
                "text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-active",
                "group-hover:opacity-100 focus-visible:opacity-100",
              )}
              onClick={() => {
                setDraft(feature.name);
                setRenaming(true);
              }}
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </>
      )}
      <Anchor type="source" />
    </div>
  );
}

export type SubGroupNodeData = {
  featureId: string;
  featureName: string;
  subFeatures: RoadmapSubFeature[];
  visibleRows: number;
  expanded: boolean;
  onToggle: (featureId: string) => void;
  onOpen: (featureId: string) => void;
};
export type SubGroupNode = Node<SubGroupNodeData, "subGroup">;

/** Kotak sub-fitur: tiga teratas, lalu "Lihat semua (n)" untuk membuka sisanya. */
export function SubGroupNodeView({ data }: NodeProps<SubGroupNode>) {
  const { featureId, featureName, subFeatures, visibleRows, expanded, onToggle, onOpen } =
    data;
  const overflow = subFeatures.length > LAYOUT.collapsedRows;
  return (
    <div
      className="pointer-events-auto flex h-full flex-col rounded-control border border-border bg-card"
      style={{ width: LAYOUT.subWidth, padding: LAYOUT.subPadding }}
    >
      <Anchor type="target" />
      <p
        className="flex shrink-0 items-center gap-1.5 px-1.5 text-xs font-medium text-muted-foreground"
        style={{ height: LAYOUT.subHeader }}
      >
        <Layers className="size-3.5" aria-hidden />
        {copy.subFeatures}
      </p>
      <ul aria-label={`${copy.subFeatures} ${featureName}`}>
        {subFeatures.slice(0, visibleRows).map((sub) => (
          <li key={sub.id} style={{ height: LAYOUT.subRow }} className="py-0.5">
            <button
              type="button"
              className="flex h-full w-full cursor-pointer items-center rounded-chip bg-muted px-2 text-left text-xs transition-colors duration-150 hover:bg-active"
              onClick={() => onOpen(featureId)}
            >
              <span className="truncate">{sub.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {overflow ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={
            expanded
              ? copy.showLessLabel(featureName)
              : copy.showAllLabel(subFeatures.length, featureName)
          }
          className="mt-auto flex shrink-0 cursor-pointer items-center justify-end px-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
          style={{ height: LAYOUT.subFooter }}
          onClick={() => onToggle(featureId)}
        >
          {expanded ? copy.showLess : copy.showAll(subFeatures.length)}
        </button>
      ) : null}
    </div>
  );
}
