import { AlertTriangle, ShieldCheck } from "lucide-react";
import { codebaseCopy } from "../copy";
import { type Codebase, DOC_ORIGINS, type DocSummary } from "../schemas";

const copy = codebaseCopy.ui.info;
const skippedLabel = codebaseCopy.skipped as Record<string, string>;

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );

/**
 * Panel samping halaman proyek (M7-14): teknologi, sumber, berkas, asal halaman, sensor, berkas yang
 * dipotong, dan biaya analisis.
 */
export function CodebaseInfo({
  codebase,
  docs,
  usage,
}: {
  codebase: Codebase;
  /** Versi terbaru tiap halaman, untuk menghitung asalnya (agen/AI/manual). */
  docs: readonly Pick<DocSummary, "origin">[];
  /** Total pemakaian job analisis terakhir; null bila belum pernah dianalisis server. */
  usage: { calls: number; costUsd: number } | null;
}) {
  const origins = DOC_ORIGINS.map(
    (origin) => [origin, docs.filter((d) => d.origin === origin).length] as const,
  )
    .filter(([, n]) => n > 0)
    .map(([origin, n]) => `${codebaseCopy.origin[origin]} ${n}`)
    .join(" · ");
  const summary = codebase.analysisSummary;
  const truncated = summary?.truncatedFiles ?? 0;
  const dropped = summary?.droppedFiles ?? 0;
  const stack = codebase.detectedStack;
  const rows: [string, string][] = [];
  if (stack.languages.length > 0)
    rows.push([copy.stackLabels.languages, stack.languages.join(", ")]);
  for (const key of ["frontend", "backend", "database", "deployment"] as const) {
    const value = stack[key];
    if (value) rows.push([copy.stackLabels[key], value]);
  }
  if (stack.tools.length > 0) rows.push([copy.stackLabels.tools, stack.tools.join(", ")]);
  const manifest = codebase.manifest;
  const skipped = manifest
    ? Object.entries(manifest.skipped).filter(([, n]) => n > 0)
    : [];

  return (
    <aside aria-labelledby="codebase-info-title" className="space-y-5 text-sm">
      <h2 id="codebase-info-title" className="text-base font-semibold">
        {copy.title}
      </h2>
      <div>
        <h3 className="font-medium text-muted-foreground">{copy.stack}</h3>
        {rows.length > 0 ? (
          <dl className="mt-2 space-y-1.5">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2">{copy.noStack}</p>
        )}
      </div>
      <dl className="space-y-3">
        <div>
          <dt className="font-medium text-muted-foreground">
            {codebaseCopy.ui.header.source(codebaseCopy.source[codebase.source])}
          </dt>
          {codebase.sourceRef ? (
            <dd className="mt-1 [overflow-wrap:anywhere]">{codebase.sourceRef}</dd>
          ) : null}
        </div>
        {manifest ? (
          <div>
            <dt className="font-medium text-muted-foreground">{copy.files}</dt>
            <dd className="mt-1 tabular">{copy.filesValue(manifest.totalFiles)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-medium text-muted-foreground">{copy.analyzed}</dt>
          <dd className="mt-1">
            {codebase.analyzedAt ? formatDate(codebase.analyzedAt) : copy.notYet}
          </dd>
        </div>
        {origins ? (
          <div>
            <dt className="font-medium text-muted-foreground">{copy.origins}</dt>
            <dd className="mt-1 tabular">{origins}</dd>
          </div>
        ) : null}
        {usage && usage.calls > 0 ? (
          <div>
            <dt className="font-medium text-muted-foreground">{copy.usage}</dt>
            <dd className="mt-1 tabular">
              {copy.usageValue(usage.costUsd.toFixed(3).replace(".", ","), usage.calls)}
            </dd>
          </div>
        ) : null}
      </dl>
      {manifest && manifest.redactions > 0 ? (
        <p className="flex gap-2 rounded-control bg-muted px-3 py-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
          <span>{copy.redacted(manifest.redactions, manifest.redactedFiles)}</span>
        </p>
      ) : null}
      {truncated + dropped > 0 ? (
        <p className="flex gap-2 rounded-control bg-muted px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>{copy.truncated(truncated, dropped)}</span>
        </p>
      ) : null}
      {skipped.length > 0 ? (
        <div>
          <h3 className="font-medium text-muted-foreground">{copy.skipped}</h3>
          <ul className="mt-2 space-y-1">
            {skipped.map(([reason, n]) => (
              <li key={reason} className="flex justify-between gap-3">
                <span>{skippedLabel[reason] ?? reason}</span>
                <span className="tabular text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
