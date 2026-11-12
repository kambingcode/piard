"use client";

import { RefreshCw } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { roadmapCopy } from "../copy";

const copy = roadmapCopy.regenerateConfirm;

/** "Buat ulang" mengganti semua fitur, jadi selalu dikonfirmasi dulu. */
export function RegenerateDialog({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button type="button" variant="ghost" disabled={disabled}>
          <RefreshCw aria-hidden />
          {roadmapCopy.toolbar.regenerate}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-card bg-card p-6 shadow-xl">
          <AlertDialog.Title className="text-lg font-semibold">
            {copy.title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            {copy.body}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="secondary">
                {copy.cancel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button type="button" variant="destructive" onClick={onConfirm}>
                {copy.confirm}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
