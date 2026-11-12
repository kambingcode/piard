"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api-client";
import { plansCopy } from "../copy";

const copy = plansCopy.cancelJob;

/**
 * "Batalkan" pada progres job AI plan (doc 08 bagian 6). Hasil yang sudah tersimpan tetap ada; keadaan
 * "dibatalkan" sampai ke layar lewat polling/SSE yang sudah berjalan, jadi tombol ini tidak mengubah state.
 */
export function CancelJobButton({ planId }: { planId: string }) {
  const [pending, setPending] = useState(false);

  async function cancel() {
    setPending(true);
    const result = await postJson("/api/plan/jobs/cancel", { planId });
    if (!result.ok) {
      setPending(false);
      toast.error(result.error.error);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => void cancel()}
    >
      <X aria-hidden />
      {pending ? copy.pending : copy.action}
    </Button>
  );
}
