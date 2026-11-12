"use client";

import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FeatureChange } from "@/features/roadmap";
import { cn } from "@/lib/cn";
import { revisionCopy } from "../copy";
import type { Proposal } from "../schemas";

const copy = revisionCopy.proposal;

const OP_STYLE: Record<FeatureChange["op"], string> = {
  add: "bg-positive-soft text-positive",
  update: "bg-muted text-foreground",
  remove: "bg-negative-soft text-negative",
};

function ChangeRow({ change }: { change: FeatureChange }) {
  const name = change.op === "update" ? (change.name ?? change.before.name) : change.name;
  return (
    <li className="flex gap-3 py-2.5">
      <span
        className={cn(
          "h-6 flex-none rounded-chip px-2 text-xs leading-6 font-medium",
          OP_STYLE[change.op],
        )}
      >
        {copy.ops[change.op]}
      </span>
      <div className="min-w-0 text-sm">
        <p className={cn("font-medium", change.op === "remove" && "line-through")}>
          {name}
        </p>
        {change.op === "add" ? (
          <>
            {change.summary ? (
              <p className="mt-0.5 text-muted-foreground">{change.summary}</p>
            ) : null}
            {change.subFeatures.length > 0 || change.phase ? (
              <p className="mt-0.5 text-muted-foreground tabular">
                {[
                  change.phase ? copy.phase(change.phase) : null,
                  change.subFeatures.length > 0
                    ? copy.subFeatures(change.subFeatures.length)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </>
        ) : null}
        {change.op === "update" ? (
          <div className="mt-0.5 space-y-0.5 text-muted-foreground">
            {change.name ? (
              <p>
                <span className="line-through">{change.before.name}</span> → {change.name}
              </p>
            ) : null}
            {change.summary ? <p>{change.summary}</p> : null}
            {change.phase ? (
              <p className="tabular">
                {change.before.phase ? `${copy.phase(change.before.phase)} → ` : ""}
                {copy.phase(change.phase)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Usulan perubahan fitur: daftar Ditambah/Diubah/Dihapus, lalu Terima atau Tolak sekali untuk semuanya. */
export function ProposalCard({
  proposal,
  busy,
  onAccept,
  onReject,
}: {
  proposal: Proposal;
  busy: boolean;
  onAccept: (id: string) => Promise<string | null>;
  onReject: (id: string) => Promise<string | null>;
}) {
  const titleId = `proposal-${proposal.id}`;
  async function decide(accept: boolean) {
    const error = await (accept ? onAccept : onReject)(proposal.id);
    if (error) toast.error(error);
    else if (accept) toast.success(copy.acceptedToast(proposal.changes.length));
    else toast.success(copy.rejectedToast);
  }
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-control border border-border bg-card px-3.5 py-3"
    >
      <h3 id={titleId} className="text-sm font-semibold">
        {proposal.scope === "prd-to-features" ? copy.syncTitle : copy.title}
      </h3>
      <ul className="mt-1 divide-y divide-border">
        {proposal.changes.map((change, index) => (
          <ChangeRow
            key={
              change.op === "add" ? `add-${index}` : `${change.op}-${change.featureId}`
            }
            change={change}
          />
        ))}
      </ul>
      {proposal.status === "pending" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void decide(true)}
          >
            {copy.accept}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void decide(false)}
          >
            {copy.reject}
          </Button>
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          {proposal.status === "accepted" ? (
            <Check className="size-4 text-positive" aria-hidden />
          ) : (
            <X className="size-4" aria-hidden />
          )}
          {proposal.status === "accepted" ? copy.accepted : copy.rejected}
        </p>
      )}
    </section>
  );
}
