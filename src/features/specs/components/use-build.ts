"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { showUndoToast } from "@/components/patterns/confirm-undo";
import type { RoadmapState } from "@/features/roadmap";
import type { PatchTaskInput, Task } from "@/features/tasks";
import { apiRequest, postJson } from "@/lib/api-client";
import { useEventSource } from "@/lib/use-event-source";
import { specsCopy } from "../copy";
import type { BuildJobEvent, BuildState } from "../schemas";

const NOT_FOUND = 404;

export type BuildData = {
  build: BuildState;
  roadmap: Pick<RoadmapState, "features" | "subFeatures">;
  tasks: Task[];
};

/**
 * Keadaan spesifikasi & task di klien: SSE `job` memperbarui progres seketika, dan setiap fitur yang
 * selesai (atau job yang berakhir) memuat ulang fitur dan task dari server.
 */
export function useBuild(planId: string, initial: BuildData) {
  const [data, setData] = useState(initial);
  /** Fitur yang task-nya sedang disusun ulang lewat job satu fitur. */
  const [workingFeatureId, setWorkingFeatureId] = useState<string | null>(null);
  /** Task yang menunggu jendela Undo sebelum benar-benar dihapus. */
  const [hiddenTasks, setHiddenTasks] = useState<ReadonlySet<string>>(() => new Set());
  const query = `planId=${encodeURIComponent(planId)}`;

  const reload = useCallback(async () => {
    const [build, roadmap, tasks] = await Promise.all([
      apiRequest<BuildState>(`/api/plan/generation/status?${query}`),
      apiRequest<RoadmapState>(`/api/plan/roadmap/generate?${query}`),
      apiRequest<{ tasks: Task[] }>(`/api/plan/tasks/list?${query}`),
    ]);
    setData((current) => ({
      build: build.ok ? build.data : current.build,
      roadmap: roadmap.ok
        ? { features: roadmap.data.features, subFeatures: roadmap.data.subFeatures }
        : current.roadmap,
      tasks: tasks.ok ? tasks.data.tasks : current.tasks,
    }));
  }, [query]);

  // Updater setState berjalan malas, jadi perbandingan dengan keadaan sebelumnya memakai ref.
  const doneRef = useRef(initial.build.doneFeatures);

  const onJob = useCallback(
    (event: BuildJobEvent) => {
      const finished = event.status === "done" || event.status === "error";
      const counted = event.phase === "enrich" || event.phase === "done";
      const progressed = counted && event.doneFeatures !== doneRef.current;
      if (counted) doneRef.current = event.doneFeatures;
      setData((current) => ({
        ...current,
        build: {
          ...current.build,
          status: finished ? current.build.status : "generating",
          doneFeatures: counted ? event.doneFeatures : current.build.doneFeatures,
          job: {
            id: event.jobId,
            kind: event.kind,
            phase: event.phase,
            error: event.error,
          },
        },
      }));
      setWorkingFeatureId(finished ? null : event.featureId);
      if (finished || progressed) void reload();
    },
    [reload],
  );

  useEventSource<{ job: BuildJobEvent }>(`/api/plan/generation/stream?${query}`, {
    job: onJob,
  });

  const start = useCallback(
    async (regenerate = false) => {
      setData((current) => ({
        ...current,
        build: {
          ...current.build,
          status: "generating",
          job: {
            id: current.build.job?.id ?? "",
            kind: "build",
            phase: "queued",
            error: null,
          },
        },
      }));
      const result = await postJson<{ status: BuildState["status"] }>(
        "/api/plan/generation/start",
        { planId, regenerate },
      );
      if (!result.ok) {
        setData((current) => ({
          ...current,
          build: {
            ...current.build,
            status: "failed",
            job: { id: "", kind: "build", phase: "queued", error: result.error.error },
          },
        }));
        return;
      }
      await reload();
    },
    [planId, reload],
  );

  const regenerateTasks = useCallback(
    async (featureId: string): Promise<string | null> => {
      setWorkingFeatureId(featureId);
      const result = await postJson<{ status: BuildState["status"] }>(
        "/api/plan/tasks/generate",
        { featureId },
      );
      if (!result.ok) {
        setWorkingFeatureId(null);
        return result.error.error;
      }
      await reload();
      return null;
    },
    [reload],
  );

  /** "Sesuaikan task": menyusun ulang fitur yang berubah. */
  const syncTasks = useCallback(async () => {
    setData((current) => ({
      ...current,
      build: {
        ...current.build,
        status: "generating",
        job: {
          id: current.build.job?.id ?? "",
          kind: "sync-tasks",
          phase: "queued",
          error: null,
        },
      },
    }));
    const result = await postJson<{ status: BuildState["status"] }>(
      "/api/plan/sync/tasks",
      {
        planId,
      },
    );
    if (!result.ok) {
      setData((current) => ({
        ...current,
        build: {
          ...current.build,
          status: "failed",
          job: { id: "", kind: "sync-tasks", phase: "queued", error: result.error.error },
        },
      }));
      return;
    }
    await reload();
  }, [planId, reload]);

  /** Menyimpan perubahan satu task (edit di tempat). @returns pesan galat, atau null bila berhasil. */
  const updateTask = useCallback(
    async (id: string, patch: PatchTaskInput): Promise<string | null> => {
      const result = await apiRequest<{ task: Task }>(`/api/plan/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!result.ok) return result.error.error;
      const saved = result.data.task;
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === saved.id ? saved : task)),
      }));
      return null;
    },
    [],
  );

  /**
   * Hapus dengan Undo 8 detik (doc 08 bagian 6), sama dengan fitur dan plan: task langsung disembunyikan,
   * DELETE baru dikirim setelah jendela habis.
   */
  const removeTask = useCallback((task: Task) => {
    const hide = (on: boolean) =>
      setHiddenTasks((current) => {
        const next = new Set(current);
        if (on) next.add(task.id);
        else next.delete(task.id);
        return next;
      });
    hide(true);
    showUndoToast({
      message: specsCopy.task.deleted(task.title),
      onUndo: () => hide(false),
      onCommit: async () => {
        const result = await apiRequest(`/api/plan/tasks/${task.id}`, {
          method: "DELETE",
        });
        if (!result.ok && result.status !== NOT_FOUND) {
          hide(false);
          toast.error(result.error.error || specsCopy.task.deleteFailed);
          return;
        }
        setData((current) => ({
          ...current,
          tasks: current.tasks.filter((item) => item.id !== task.id),
        }));
        hide(false);
      },
    });
  }, []);

  const visibleData =
    hiddenTasks.size === 0
      ? data
      : { ...data, tasks: data.tasks.filter((task) => !hiddenTasks.has(task.id)) };

  return {
    data: visibleData,
    start,
    syncTasks,
    regenerateTasks,
    updateTask,
    removeTask,
    workingFeatureId,
    reload,
  };
}
