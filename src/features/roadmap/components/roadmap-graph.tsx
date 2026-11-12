"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  type Edge,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { roadmapCopy } from "../copy";
import { canvasHeightFor, computeLayout, LAYOUT, readableViewport } from "../layout";
import type { RoadmapFeature, RoadmapSubFeature } from "../schemas";
import {
  type FeatureNode,
  FeatureNodeView,
  type PrdNode,
  PrdNodeView,
  type SubGroupNode,
  SubGroupNodeView,
} from "./roadmap-nodes";

const copy = roadmapCopy.graph;

// Di luar komponen: React Flow memperingatkan bila objek ini dibuat ulang tiap render.
const NODE_TYPES = {
  prd: PrdNodeView,
  feature: FeatureNodeView,
  subGroup: SubGroupNodeView,
};
const EDGE_STYLE = { stroke: "var(--control-border)", strokeWidth: 1.5 };
const ZOOM = { min: 0.3, max: 1.5 } as const;
const ARIA_LABELS = {
  "node.a11yDescription.default": "Node roadmap.",
  "node.a11yDescription.keyboardDisabled": "Node roadmap.",
  "edge.a11yDescription.default": "Hubungan antar fitur.",
  "controls.ariaLabel": copy.label,
};

type RoadmapNode = PrdNode | FeatureNode | SubGroupNode;

export type RoadmapGraphProps = {
  title: string;
  features: RoadmapFeature[];
  subFeatures: RoadmapSubFeature[];
  selectedId: string | null;
  editable: boolean;
  onOpen: (featureId: string) => void;
  onRename: (featureId: string, name: string) => void;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const motionMs = (ms: number) => (prefersReducedMotion() ? 0 : ms);

type Size = { width: number; height: number };

/**
 * Mengembalikan tampilan terbaca (lihat `readableViewport`). Viewport dihitung dari ukuran layout;
 * `fitView` milik React Flow tidak dipakai karena dalam mode terkontrol (tanpa `onNodesChange`)
 * antreannya tidak pernah dijalankan.
 */
function useResetView(graph: Size) {
  const { setViewport } = useReactFlow();
  const canvasWidth = useStore((s) => s.width);
  const canvasHeight = useStore((s) => s.height);
  const reset = useCallback(
    (duration: number) => {
      if (!canvasWidth) return;
      void setViewport(readableViewport(graph, canvasWidth), { duration });
    },
    [graph, canvasWidth, setViewport],
  );
  return { reset, canvasWidth, canvasHeight };
}

/**
 * Menata ulang tampilan saat node bertambah (job berjalan) atau ukuran kanvas berubah, tetapi tidak
 * saat pengguna memilih atau mengganti nama (zoom dan geser pengguna dipertahankan).
 */
function AutoReset({ graph, count }: { graph: Size; count: number }) {
  const { reset, canvasWidth, canvasHeight } = useResetView(graph);
  const latest = useRef(reset);
  latest.current = reset;
  // biome-ignore lint/correctness/useExhaustiveDependencies: sengaja hanya jumlah node dan ukuran kanvas
  useEffect(() => latest.current(motionMs(300)), [count, canvasWidth, canvasHeight]);
  return null;
}

function ZoomControls({ graph }: { graph: Size }) {
  const { zoomIn, zoomOut } = useReactFlow();
  const { reset } = useResetView(graph);
  return (
    <Panel position="top-left" className="flex flex-col gap-1">
      <Button
        variant="secondary"
        size="icon"
        aria-label={copy.zoomIn}
        onClick={() => void zoomIn({ duration: motionMs(200) })}
      >
        <Plus />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        aria-label={copy.zoomOut}
        onClick={() => void zoomOut({ duration: motionMs(200) })}
      >
        <Minus />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        aria-label={copy.fit}
        onClick={() => reset(motionMs(200))}
      >
        <Maximize />
      </Button>
    </Panel>
  );
}

type BuiltGraph = { nodes: RoadmapNode[]; edges: Edge[]; graph: Size };

function buildGraph(
  {
    title,
    features,
    subFeatures,
    selectedId,
    editable,
    onOpen,
    onRename,
  }: RoadmapGraphProps,
  expanded: ReadonlySet<string>,
  onToggle: (featureId: string) => void,
): BuiltGraph {
  const byParent = new Map<string, RoadmapSubFeature[]>();
  for (const sub of subFeatures) {
    byParent.set(sub.parentId, [...(byParent.get(sub.parentId) ?? []), sub]);
  }
  const layout = computeLayout({
    featureIds: features.map((f) => f.id),
    subCounts: Object.fromEntries(
      features.map((f) => [f.id, byParent.get(f.id)?.length ?? 0]),
    ),
    expanded,
  });

  const nodes: RoadmapNode[] = [
    {
      id: "prd",
      type: "prd",
      position: layout.prd,
      data: { title },
      width: LAYOUT.prdWidth,
      height: LAYOUT.prdHeight,
      style: { height: LAYOUT.prdHeight },
    },
  ];
  const edges: Edge[] = [];
  for (const feature of features) {
    const position = layout.features[feature.id];
    if (!position) continue;
    nodes.push({
      id: feature.id,
      type: "feature",
      position,
      data: { feature, selected: feature.id === selectedId, editable, onOpen, onRename },
      width: LAYOUT.featureWidth,
      height: LAYOUT.featureHeight,
      style: { height: LAYOUT.featureHeight },
    });
    edges.push({
      id: `prd-${feature.id}`,
      source: "prd",
      target: feature.id,
      style: EDGE_STYLE,
    });

    const box = layout.subBoxes[feature.id];
    if (!box) continue;
    const boxId = `${feature.id}-subs`;
    nodes.push({
      id: boxId,
      type: "subGroup",
      position: { x: box.x, y: box.y },
      data: {
        featureId: feature.id,
        featureName: feature.name,
        subFeatures: byParent.get(feature.id) ?? [],
        visibleRows: box.visibleRows,
        expanded: expanded.has(feature.id),
        onToggle,
        onOpen,
      },
      width: LAYOUT.subWidth,
      height: box.height,
      style: { height: box.height },
    });
    edges.push({
      id: `${feature.id}-to-subs`,
      source: feature.id,
      target: boxId,
      style: EDGE_STYLE,
    });
  }
  return { nodes, edges, graph: { width: layout.width, height: layout.height } };
}

function Graph({ nodes, edges, graph }: BuiltGraph) {
  return (
    <ReactFlow<RoadmapNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      aria-label={copy.label}
      ariaLabelConfig={ARIA_LABELS}
      minZoom={ZOOM.min}
      maxZoom={ZOOM.max}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
      style={{ background: "transparent" }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.2}
        color="var(--control-border)"
      />
      <ZoomControls graph={graph} />
      <AutoReset graph={graph} count={nodes.length} />
    </ReactFlow>
  );
}

/** Lebar elemen yang diamati (0 sebelum diukur). */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Graf roadmap (React Flow): PRD → fitur berlabel fase → kotak sub-fitur. Kanvas setinggi graf pada
 * zoom terbaca sehingga halaman yang digulir. Hanya dirender di layar lebar setelah hidrasi;
 * ponsel dan pembaca layar memakai tampilan daftar.
 */
export function RoadmapGraph(props: RoadmapGraphProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (id: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const built = useMemo(
    () => buildGraph(props, expanded, toggle),
    [props, expanded, toggle],
  );
  const container = useRef<HTMLDivElement>(null);
  const width = useWidth(container);
  const height = width ? canvasHeightFor(built.graph, width) : 480;

  return (
    <div
      ref={container}
      style={{ height }}
      className="overflow-hidden rounded-card border border-border bg-background"
    >
      <ReactFlowProvider>
        <Graph {...built} />
      </ReactFlowProvider>
    </div>
  );
}
