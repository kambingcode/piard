"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, postJson } from "@/lib/api-client";
import type { PrdJobKind, PrdState } from "../schemas";

/** Jeda polling selama job berjalan; cukup rapat agar teks terasa mengalir. */
export const POLL_MS = 1_000;

/** Keadaan PRD di klien: mengikuti job lewat polling dan memulai atau mengulang job. */
export function usePrd(planId: string, initial: PrdState) {
  const [state, setState] = useState(initial);

  const reload = useCallback(async () => {
    const result = await apiRequest<PrdState>(
      `/api/plan/generate?planId=${encodeURIComponent(planId)}`,
    );
    if (result.ok) setState(result.data);
    return result;
  }, [planId]);

  // Polling berantai: satu permintaan tiap kali keadaan berubah, selama job berjalan.
  useEffect(() => {
    if (state.status !== "generating") return;
    let stopped = false;
    const timer = setTimeout(async () => {
      const result = await reload();
      // Galat jaringan sesaat: coba lagi pada jadwal berikutnya tanpa mengganggu pengguna.
      if (!stopped && !result.ok) setState((current) => ({ ...current }));
    }, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state, reload]);

  /** Memulai job lewat `url`; keadaan langsung "generating" agar progres tampil tanpa menunggu. */
  const run = useCallback(
    async (kind: PrdJobKind, url: string, body: Record<string, unknown>) => {
      setState((current) => ({
        ...current,
        status: "generating",
        draft: "",
        job: {
          id: current.job?.id ?? "",
          kind,
          phase: "queued",
          sections: 0,
          error: null,
        },
      }));
      const result = await postJson<{ status: PrdState["status"] }>(url, body);
      if (!result.ok) {
        setState((current) => ({
          ...current,
          status: "failed",
          job: {
            id: "",
            kind,
            phase: "queued",
            sections: 0,
            error: result.error.error,
          },
        }));
        return;
      }
      await reload();
    },
    [reload],
  );

  const start = useCallback(
    (regenerate = false) => run("generate", "/api/plan/generate", { planId, regenerate }),
    [planId, run],
  );

  /** Mengulang revisi terakhir yang gagal (permintaannya disimpan di server). */
  const retryRevision = useCallback(
    () => run("revise", "/api/plan/revise", { planId }),
    [planId, run],
  );

  return { state, setState, start, retryRevision, reload };
}

export type PrdController = ReturnType<typeof usePrd>;
