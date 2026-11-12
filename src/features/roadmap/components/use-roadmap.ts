"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { showUndoToast } from "@/components/patterns/confirm-undo";
import { apiRequest, postJson } from "@/lib/api-client";
import { roadmapCopy } from "../copy";
import type {
  PatchFeatureInput,
  PatchSubFeatureInput,
  RoadmapFeature,
  RoadmapState,
  RoadmapSubFeature,
} from "../schemas";

/** Jeda polling selama job berjalan; situs acuan ±5 detik, di sini lebih rapat agar node terasa mengalir. */
export const POLL_MS = 1_500;
const NOT_FOUND = 404;

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const result = await apiRequest<T>(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!result.ok) throw new Error(result.error.error);
  return result.data;
}

/**
 * Keadaan roadmap di klien: mengikuti job lewat polling, memulai/mengulang job, dan mengubah
 * fitur secara optimistis (graf langsung berubah; galat dikembalikan ke keadaan server).
 */
export function useRoadmap(planId: string, initial: RoadmapState) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  /** Item yang sedang dalam jendela Undo: disembunyikan tetapi belum dihapus di server. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const previousStatus = useRef(initial.status);

  const reload = useCallback(async () => {
    const result = await apiRequest<RoadmapState>(
      `/api/plan/roadmap/generate?planId=${encodeURIComponent(planId)}`,
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

  // Selesai dibuat: judul plan di kepala halaman (komponen server) ikut diperbarui.
  useEffect(() => {
    if (previousStatus.current === "generating" && state.status !== "generating") {
      router.refresh();
    }
    previousStatus.current = state.status;
  }, [state.status, router]);

  const start = useCallback(
    async (regenerate = false) => {
      setState((current) => ({
        ...current,
        status: "generating",
        job: { id: current.job?.id ?? "", phase: "queued", done: 0, error: null },
      }));
      const result = await postJson<{ status: RoadmapState["status"] }>(
        "/api/plan/roadmap/generate",
        { planId, regenerate },
      );
      if (!result.ok) {
        setState((current) => ({
          ...current,
          status: "failed",
          job: { id: "", phase: "queued", done: 0, error: result.error.error },
        }));
        return;
      }
      await reload();
    },
    [planId, reload],
  );

  const patchFeature = useCallback(async (id: string, patch: PatchFeatureInput) => {
    setState((current) => ({
      ...current,
      features: current.features.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      subFeatures:
        patch.phase === undefined
          ? current.subFeatures
          : current.subFeatures.map((s) =>
              s.parentId === id ? { ...s, phase: patch.phase ?? s.phase } : s,
            ),
    }));
    await send(`/api/plan/features/${id}`, "PATCH", patch);
  }, []);

  const patchSubFeature = useCallback(async (id: string, patch: PatchSubFeatureInput) => {
    setState((current) => ({
      ...current,
      subFeatures: current.subFeatures.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
    await send(`/api/plan/subfeatures/${id}`, "PATCH", patch);
  }, []);

  const addFeature = useCallback(async (): Promise<RoadmapFeature | undefined> => {
    try {
      const { feature } = await send<{ feature: RoadmapFeature }>(
        "/api/plan/features/create",
        "POST",
        { planId, name: roadmapCopy.newFeatureName },
      );
      setState((current) => ({
        ...current,
        status: current.status === "idle" ? "ready" : current.status,
        features: [...current.features, feature],
      }));
      return feature;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : roadmapCopy.saveFailed);
      return undefined;
    }
  }, [planId]);

  const addSubFeature = useCallback(async (featureId: string) => {
    try {
      const { subFeature } = await send<{ subFeature: RoadmapSubFeature }>(
        "/api/plan/subfeatures/create",
        "POST",
        { featureId, name: roadmapCopy.panel.newSubName },
      );
      setState((current) => ({
        ...current,
        subFeatures: [...current.subFeatures, subFeature],
      }));
      return subFeature;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : roadmapCopy.saveFailed);
      return undefined;
    }
  }, []);

  /** Hapus dengan Undo 8 detik (doc 08): item disembunyikan, DELETE dikirim setelah jendela habis. */
  const remove = useCallback(
    (kind: "features" | "subfeatures", item: { id: string; name: string }) => {
      const hide = (on: boolean) =>
        setHidden((current) => {
          const next = new Set(current);
          if (on) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
      hide(true);
      showUndoToast({
        message: roadmapCopy.deleted(item.name),
        onUndo: () => hide(false),
        onCommit: async () => {
          const result = await apiRequest(`/api/plan/${kind}/${item.id}`, {
            method: "DELETE",
          });
          if (!result.ok && result.status !== NOT_FOUND) {
            hide(false);
            toast.error(result.error.error || roadmapCopy.deleteFailed);
            return;
          }
          setState((current) => ({
            ...current,
            features: current.features.filter((f) => f.id !== item.id),
            subFeatures: current.subFeatures.filter(
              (s) => s.id !== item.id && s.parentId !== item.id,
            ),
          }));
          hide(false);
        },
      });
    },
    [],
  );

  const features = state.features.filter((f) => !hidden.has(f.id));
  const subFeatures = state.subFeatures.filter(
    (s) => !hidden.has(s.id) && !hidden.has(s.parentId),
  );

  return {
    state,
    features,
    subFeatures,
    editable: state.status === "ready" || state.status === "failed",
    start,
    patchFeature,
    patchSubFeature,
    addFeature,
    addSubFeature,
    remove,
  };
}

export type RoadmapController = ReturnType<typeof useRoadmap>;
