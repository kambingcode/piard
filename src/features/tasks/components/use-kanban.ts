"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { Task, TaskStatus } from "../schemas";

async function send<T>(url: string, method: string, body: unknown) {
  return apiRequest<T>(url, { method, body: JSON.stringify(body) });
}

/**
 * Papan kanban di klien: perubahan status optimistis (kartu langsung pindah), dikembalikan ke
 * keadaan server bila gagal. `refreshKey` yang berubah memuat ulang dari server (perubahan oleh agen,
 * M8-11). @returns pesan galat dari aksi, atau null.
 */
export function useKanban(planId: string, initial: Task[], refreshKey = 0) {
  const [tasks, setTasks] = useState(initial);

  const reload = useCallback(async () => {
    const result = await apiRequest<{ tasks: Task[] }>(
      `/api/plan/tasks/list?planId=${encodeURIComponent(planId)}`,
    );
    if (result.ok) setTasks(result.data.tasks);
  }, [planId]);

  const loadedKey = useRef(refreshKey);
  useEffect(() => {
    if (loadedKey.current === refreshKey) return;
    loadedKey.current = refreshKey;
    void reload();
  }, [refreshKey, reload]);

  const setStatus = useCallback(
    async (ids: string[], status: TaskStatus): Promise<string | null> => {
      const wanted = new Set(ids);
      setTasks((current) =>
        current.map((t) => (wanted.has(t.id) ? { ...t, status } : t)),
      );
      const result =
        ids.length === 1
          ? await send(`/api/plan/tasks/${ids[0]}`, "PATCH", { status })
          : await send("/api/plan/tasks/bulk-status", "PATCH", { planId, ids, status });
      if (!result.ok) {
        await reload();
        return result.error.error;
      }
      return null;
    },
    [planId, reload],
  );

  const reset = useCallback(async (): Promise<string | null> => {
    setTasks((current) => current.map((t) => ({ ...t, status: "todo" })));
    const result = await send("/api/plan/tasks/reset", "POST", { planId });
    if (!result.ok) {
      await reload();
      return result.error.error;
    }
    return null;
  }, [planId, reload]);

  return { tasks, setStatus, reset };
}
