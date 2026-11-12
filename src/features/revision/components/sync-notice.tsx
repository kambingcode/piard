"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revisionCopy } from "../copy";
import { ProposalCard } from "./proposal-card";
import type { RevisionController } from "./use-revision";

const copy = revisionCopy.sync;

/**
 * Penanda sinkronisasi di atas chat: PRD berubah sejak fitur terakhir disesuaikan (dengan tombol
 * "Sesuaikan fitur dengan PRD"), usulan penyesuaian yang menunggu, dan fitur yang task-nya basi.
 */
export function SyncNotice({
  planId,
  revision,
}: {
  planId: string;
  revision: RevisionController;
}) {
  const { sync } = revision;
  const proposal = sync.pending.find((p) => p.scope === "prd-to-features");
  const showDirty = sync.prd.dirty && !proposal;
  if (!showDirty && !proposal && sync.staleFeatureIds.length === 0) return null;

  async function run(action: () => Promise<string | null>) {
    const error = await action();
    if (error) toast.error(error);
  }

  // Di luar area gulir chat: tanda ini harus terlihat walau percakapan sudah panjang.
  return (
    <section
      aria-label={revisionCopy.panel.syncLabel}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: area gulir perlu fokus agar bisa digulir dengan keyboard
      tabIndex={0}
      className="max-h-[45%] flex-none space-y-3 overflow-y-auto border-b border-border px-4 py-3 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {showDirty ? (
        <section
          aria-labelledby="sync-dirty-title"
          className="rounded-control bg-warning-soft px-3.5 py-3"
        >
          <h3 id="sync-dirty-title" className="text-sm font-semibold">
            {copy.dirtyTitle(sync.prd.version)}
          </h3>
          {sync.reconciling ? (
            <output className="mt-1 flex items-center gap-2 text-sm">
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              {copy.reconciling}
            </output>
          ) : (
            <>
              <p className="mt-0.5 text-sm">{sync.error ?? copy.dirtyBody}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void run(revision.reconcile)}
                >
                  {copy.reconcile}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void run(revision.dismiss)}
                >
                  {copy.dismiss}
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}
      {proposal ? (
        <ProposalCard
          proposal={proposal}
          busy={revision.busyProposal === proposal.id}
          onAccept={revision.accept}
          onReject={revision.reject}
        />
      ) : null}
      {sync.staleFeatureIds.length > 0 ? (
        <div className="rounded-control bg-muted px-3.5 py-3 text-sm">
          <p>{copy.staleTasks(sync.staleFeatureIds.length)}</p>
          <Link
            href={`/plans/${planId}/tasks`}
            className="mt-1 inline-block font-medium text-accent underline-offset-4 hover:underline"
          >
            {copy.openTasks}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
