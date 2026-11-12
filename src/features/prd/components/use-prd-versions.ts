"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, postJson } from "@/lib/api-client";
import type { PrdDocument, PrdVersion } from "../schemas";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function unwrap<T>(promise: ReturnType<typeof apiRequest<T>>): Promise<Result<T>> {
  const result = await promise;
  return result.ok
    ? { ok: true, data: result.data }
    : { ok: false, error: result.error.error };
}

/**
 * Riwayat versi PRD: daftar versi (dimuat ulang tiap versi terbaru berubah), versi lama yang
 * sedang dibaca, simpan hasil edit, dan pulihkan.
 */
export function usePrdVersions(planId: string, latest: PrdDocument | null) {
  const [versions, setVersions] = useState<PrdVersion[]>([]);
  /** Versi lama yang sedang dibuka; `null` berarti versi terbaru. */
  const [viewing, setViewing] = useState<PrdDocument | null>(null);
  const latestVersion = latest?.version ?? 0;

  const query = `planId=${encodeURIComponent(planId)}`;

  useEffect(() => {
    if (latestVersion === 0) return;
    let stale = false;
    void unwrap(
      apiRequest<{ versions: PrdVersion[] }>(`/api/plan/documents?${query}`),
    ).then((result) => {
      if (!stale && result.ok) setVersions(result.data.versions);
    });
    // Versi baru (simpan, pulihkan, buat ulang) selalu membawa pembaca ke versi terbaru.
    setViewing(null);
    return () => {
      stale = true;
    };
  }, [query, latestVersion]);

  const open = useCallback(
    async (version: number): Promise<Result<PrdDocument | null>> => {
      if (version === latestVersion) {
        setViewing(null);
        return { ok: true, data: null };
      }
      const result = await unwrap(
        apiRequest<{ document: PrdDocument }>(
          `/api/plan/documents?${query}&version=${version}`,
        ),
      );
      if (result.ok) setViewing(result.data.document);
      return result.ok ? { ok: true, data: result.data.document } : result;
    },
    [query, latestVersion],
  );

  const save = useCallback(
    async (content: string) =>
      unwrap(
        postJson<{ document: PrdDocument }>("/api/plan/save-document", {
          planId,
          content,
        }),
      ),
    [planId],
  );

  const restore = useCallback(
    async (version: number) =>
      unwrap(
        postJson<{ document: PrdDocument }>("/api/plan/documents/restore", {
          planId,
          version,
        }),
      ),
    [planId],
  );

  return { versions, viewing, open, close: () => setViewing(null), save, restore };
}
