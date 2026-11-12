import { CircleAlert, Gauge } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/patterns/empty-state";
import { cn } from "@/lib/cn";
import { usageCopy } from "../copy";
import { budgetRatio, formatCount, formatUsd, taskLabel, timeFormat } from "../format";
import {
  type BudgetPeriodView,
  MAX_RUNS,
  type PlanUsage,
  type UsageRun,
} from "../schemas";

const copy = usageCopy;
const PERCENT = 100;

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-[-0.01em] tabular">{value}</dd>
    </div>
  );
}

/** Satu batas: teks selalu ada; bilah hanya penegas visual (warna bukan satu-satunya penanda). */
function BudgetMeter({ label, period }: { label: string; period: BudgetPeriodView }) {
  const ratio = budgetRatio(period.spentUsd, period.limitUsd);
  const reached = period.limitUsd !== null && period.spentUsd >= period.limitUsd;
  const spent = formatUsd(period.spentUsd);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground tabular">
          {period.limitUsd === null
            ? copy.budget.unlimited(spent)
            : copy.budget.of(spent, formatUsd(period.limitUsd))}
        </span>
      </div>
      {ratio === null ? null : (
        <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              reached ? "bg-negative" : "bg-foreground",
            )}
            style={{ width: `${ratio * PERCENT}%` }}
          />
        </div>
      )}
      {reached ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-negative">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {copy.budget.reached}
        </p>
      ) : null}
    </div>
  );
}

function RunRow({ run }: { run: UsageRun }) {
  const details = [
    timeFormat.format(run.startedAt),
    run.models.join(", "),
    run.calls > 1 ? copy.runs.calls(run.calls) : null,
  ].filter(Boolean);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 text-sm font-medium">{taskLabel(run.kinds)}</p>
        <p className="shrink-0 text-sm font-medium tabular">{formatUsd(run.costUsd)}</p>
      </div>
      {/* Di layar sempit token turun ke baris sendiri, bukan memotong nama model. */}
      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
        <p className="min-w-0 break-words">
          <time dateTime={run.startedAt.toISOString()}>{details[0]}</time>
          {details.slice(1).map((detail) => ` · ${detail}`)}
        </p>
        <p className="text-xs tabular">
          {copy.runs.tokens(formatCount(run.inputTokens), formatCount(run.outputTokens))}
        </p>
      </div>
    </li>
  );
}

/** `/plans/:id/usage`: token dan biaya tiap run AI plan ini, total, dan batas biaya aplikasi. */
export function UsageView({ usage }: { usage: PlanUsage }) {
  const { runs, totals, budget } = usage;
  return (
    <div>
      {/* Setinggi tombol aksi di tab lain agar baris meta sejajar di semua tab plan. */}
      <p className="flex min-h-10 items-center text-sm text-muted-foreground tabular">
        {copy.title} · {copy.meta(totals.calls)}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Stat
          className="col-span-2 sm:col-span-1"
          label={copy.totals.cost}
          value={formatUsd(totals.costUsd)}
        />
        <Stat label={copy.totals.input} value={formatCount(totals.inputTokens)} />
        <Stat label={copy.totals.output} value={formatCount(totals.outputTokens)} />
      </dl>

      <section aria-labelledby="usage-budget" className="mt-8 rounded-card bg-card p-5">
        <h2 id="usage-budget" className="text-base font-semibold">
          {copy.budget.heading}
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <BudgetMeter label={copy.budget.daily} period={budget.daily} />
          <BudgetMeter label={copy.budget.monthly} period={budget.monthly} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {copy.budget.note}{" "}
          <Link href="/settings" className="text-accent underline underline-offset-4">
            {copy.budget.change}
          </Link>
        </p>
      </section>

      <section aria-labelledby="usage-runs" className="mt-8">
        <h2 id="usage-runs" className="text-base font-semibold">
          {copy.runs.heading}
        </h2>
        {runs.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Gauge}
            title={copy.empty.title}
            description={copy.empty.body}
          />
        ) : (
          <>
            <ol className="mt-2 divide-y divide-border">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </ol>
            {runs.length >= MAX_RUNS ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {copy.runs.truncated(runs.length)}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
