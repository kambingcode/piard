"use client";

import { MessageSquare, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/features/plans";
import { type PrdController, type PrdState, PrdView } from "@/features/prd";
import { revisionCopy } from "../copy";
import { RevisionPanel } from "./revision-panel";
import { type RevisionData, useRevision } from "./use-revision";

const copy = revisionCopy.panel;

/** Panel revisi untuk satu pengendali PRD: kolom kanan di layar lebar (xl), lembar di bawahnya. */
function RevisionAside({
  plan,
  initial,
  prd,
}: {
  plan: Plan;
  initial: RevisionData;
  prd: PrdController;
}) {
  const revision = useRevision(plan.id, initial, prd);
  const [open, setOpen] = useState(false);
  const hasPrd = prd.state.document !== null;
  const attention =
    revision.sync.prd.dirty ||
    revision.sync.pending.length > 0 ||
    revision.pending !== null;

  return (
    <>
      <aside className="hidden xl:block">
        <RevisionPanel
          planId={plan.id}
          revision={revision}
          hasPrd={hasPrd}
          className="sticky top-6 h-[calc(100dvh-3rem)]"
        />
      </aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button
            type="button"
            className="fixed right-4 bottom-4 z-30 shadow-lg xl:hidden"
          >
            <MessageSquare aria-hidden />
            {copy.title}
            {attention ? (
              <span className="size-2 rounded-full bg-accent" aria-hidden />
            ) : null}
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay xl:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col rounded-t-card bg-card shadow-xl md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[420px] md:rounded-none md:rounded-l-card xl:hidden"
          >
            <Dialog.Title className="sr-only">{copy.title}</Dialog.Title>
            <RevisionPanel
              planId={plan.id}
              revision={revision}
              hasPrd={hasPrd}
              className="h-full"
              headerAction={
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy.close}
                  >
                    <X aria-hidden />
                  </Button>
                </Dialog.Close>
              }
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** Halaman PRD dengan chat revisi di sampingnya (split view PRD | chat, R13). */
export function PrdWorkspace({
  plan,
  initial,
  revision,
}: {
  plan: Plan;
  initial: PrdState;
  revision: RevisionData;
}) {
  return (
    <PrdView
      plan={plan}
      initial={initial}
      aside={(prd) => <RevisionAside plan={plan} initial={revision} prd={prd} />}
    />
  );
}
