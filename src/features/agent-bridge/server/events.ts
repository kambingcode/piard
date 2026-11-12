import "server-only";

import type { TaskStatus } from "@/features/tasks";

/** Perubahan card oleh agen atau tinjauan pengguna, dipancarkan ke SSE kanban (M8-11). */
export type BoardEvent = {
  planId: string;
  taskId: string;
  status: TaskStatus;
  reason: "claim" | "report" | "release" | "note" | "review";
};

type Listener = (event: BoardEvent) => void;

// Di globalThis: route agen dan route SSE bisa dimuat dalam graf modul berbeda (lihat errors.ts), tetapi
// harus berbagi daftar pendengar yang sama dalam satu proses.
const globalForBoard = globalThis as typeof globalThis & {
  __piardAgentBoard?: Map<string, Set<Listener>>;
};

function listeners(): Map<string, Set<Listener>> {
  globalForBoard.__piardAgentBoard ??= new Map();
  return globalForBoard.__piardAgentBoard;
}

export function publishBoardEvent(event: BoardEvent): void {
  for (const listener of listeners().get(event.planId) ?? []) {
    try {
      listener(event);
    } catch {
      // Satu koneksi SSE yang putus tidak boleh menggagalkan aksi agen.
    }
  }
}

export function subscribeBoard(planId: string, listener: Listener): () => void {
  const all = listeners();
  const set = all.get(planId) ?? new Set<Listener>();
  set.add(listener);
  all.set(planId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) all.delete(planId);
  };
}
