/**
 * Tata letak graf roadmap (fungsi murni): node PRD di kiri, satu kolom fitur, satu kolom kotak
 * sub-fitur. Tinggi tiap node pasti (teks satu baris dipotong), jadi posisi bisa dihitung tanpa
 * mengukur DOM dan node tidak pernah bertumpuk, termasuk saat "Lihat semua" dibuka.
 */
export const LAYOUT = {
  prdWidth: 220,
  prdHeight: 64,
  featureWidth: 248,
  featureHeight: 72,
  subWidth: 240,
  subHeader: 36,
  subRow: 32,
  subFooter: 32,
  subPadding: 8,
  /** Jumlah sub-fitur yang terlihat sebelum "Lihat semua (n)". */
  collapsedRows: 3,
  columnGap: 96,
  rowGap: 24,
} as const;

export type Point = { x: number; y: number };

export type LayoutInput = {
  /** Fitur level atas, urut posisi. */
  featureIds: string[];
  /** Jumlah sub-fitur per fitur. */
  subCounts: Record<string, number>;
  /** Fitur yang kotak sub-fiturnya dibuka penuh. */
  expanded: ReadonlySet<string>;
};

export type GraphLayout = {
  prd: Point;
  features: Record<string, Point>;
  subBoxes: Record<string, Point & { height: number; visibleRows: number }>;
  width: number;
  height: number;
};

export function visibleSubRows(count: number, expanded: boolean): number {
  return expanded ? count : Math.min(count, LAYOUT.collapsedRows);
}

/** Tinggi kotak sub-fitur; 0 bila fitur belum punya sub-fitur (kotak tidak digambar). */
export function subBoxHeight(count: number, expanded: boolean): number {
  if (count === 0) return 0;
  const footer = count > LAYOUT.collapsedRows ? LAYOUT.subFooter : 0;
  return (
    LAYOUT.subHeader +
    visibleSubRows(count, expanded) * LAYOUT.subRow +
    footer +
    LAYOUT.subPadding * 2
  );
}

export function computeLayout({
  featureIds,
  subCounts,
  expanded,
}: LayoutInput): GraphLayout {
  const featureX = LAYOUT.prdWidth + LAYOUT.columnGap;
  const subX = featureX + LAYOUT.featureWidth + LAYOUT.columnGap;
  const features: GraphLayout["features"] = {};
  const subBoxes: GraphLayout["subBoxes"] = {};

  let y = 0;
  for (const id of featureIds) {
    const count = subCounts[id] ?? 0;
    const open = expanded.has(id);
    const boxHeight = subBoxHeight(count, open);
    const rowHeight = Math.max(LAYOUT.featureHeight, boxHeight);
    features[id] = { x: featureX, y: y + (rowHeight - LAYOUT.featureHeight) / 2 };
    if (boxHeight > 0) {
      subBoxes[id] = {
        x: subX,
        y,
        height: boxHeight,
        visibleRows: visibleSubRows(count, open),
      };
    }
    y += rowHeight + LAYOUT.rowGap;
  }

  const height = Math.max(LAYOUT.prdHeight, y - LAYOUT.rowGap);
  return {
    prd: { x: 0, y: (height - LAYOUT.prdHeight) / 2 },
    features,
    subBoxes,
    width: subX + LAYOUT.subWidth,
    height,
  };
}

/** Zoom paling kecil yang masih terbaca; di bawah ini kanvas digeser, bukan dikecilkan. */
export const READABLE = {
  minZoom: 0.6,
  maxZoom: 1,
  padding: 24,
  minCanvasHeight: 480,
} as const;

/**
 * Viewport awal yang terbaca: graf selebar kanvas (zoom maksimal 1, minimal {@link READABLE}.minZoom),
 * di tengah secara horizontal dan rata atas. Graf yang tinggi tidak dikecilkan; kanvasnya yang
 * ditinggikan ({@link canvasHeightFor}) sehingga halaman yang digulir.
 */
export function readableViewport(
  graph: { width: number; height: number },
  canvasWidth: number,
): { x: number; y: number; zoom: number } {
  const fit = (canvasWidth - READABLE.padding * 2) / graph.width;
  const zoom = Math.min(READABLE.maxZoom, Math.max(READABLE.minZoom, fit));
  return {
    x: Math.max(READABLE.padding, (canvasWidth - graph.width * zoom) / 2),
    y: READABLE.padding,
    zoom,
  };
}

/** Tinggi kanvas agar seluruh graf terlihat pada zoom terbaca. */
export function canvasHeightFor(
  graph: { width: number; height: number },
  canvasWidth: number,
): number {
  const { zoom } = readableViewport(graph, canvasWidth);
  return Math.max(
    READABLE.minCanvasHeight,
    Math.ceil(graph.height * zoom + READABLE.padding * 2),
  );
}
