"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PrdController } from "@/features/prd";
import { apiRequest, postJson, postStream } from "@/lib/api-client";
import { revisionCopy } from "../copy";
import type {
  ChatMessage,
  ChatPart,
  ChatStreamEvent,
  Proposal,
  SyncStatus,
} from "../schemas";

/** Jeda polling selama job penyesuaian fitur berjalan. */
export const SYNC_POLL_MS = 1_500;

export type RevisionData = { messages: ChatMessage[]; sync: SyncStatus };

/** Balasan yang sedang dialirkan (belum tersimpan). */
export type PendingReply = { text: string; parts: ChatPart[] };

function isStreamEvent(value: unknown): value is ChatStreamEvent {
  return typeof value === "object" && value !== null && "type" in value;
}

/** Mengganti usulan di semua pesan dengan keadaan terbarunya (mis. setelah diterima). */
function withProposal(messages: ChatMessage[], proposal: Proposal): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "proposal" && part.proposal.id === proposal.id
        ? { ...part, proposal }
        : part,
    ),
  }));
}

/**
 * Keadaan panel revisi: riwayat chat, balasan yang mengalir, dan sinkronisasi. Revisi PRD yang
 * dimulai dari chat diserahkan ke `prd.reload()` (PRD lalu dipoll seperti biasa); begitu job PRD
 * selesai, riwayat dan sinkronisasi dimuat ulang agar status revisi dan tanda "PRD berubah" ikut.
 */
export function useRevision(planId: string, initial: RevisionData, prd: PrdController) {
  const [messages, setMessages] = useState(initial.messages);
  const [sync, setSync] = useState(initial.sync);
  const [pending, setPending] = useState<PendingReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Teks yang dikembalikan ke kotak pesan saat pengiriman gagal. */
  const [restore, setRestore] = useState<string | null>(null);
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const query = `planId=${encodeURIComponent(planId)}`;

  const reload = useCallback(async () => {
    const [chat, status] = await Promise.all([
      apiRequest<{ messages: ChatMessage[] }>(`/api/plan/chat?${query}`),
      apiRequest<SyncStatus>(`/api/plan/sync/status?${query}`),
    ]);
    if (chat.ok) setMessages(chat.data.messages);
    if (status.ok) setSync(status.data);
  }, [query]);

  // Job PRD (revisi) berakhir atau versi PRD berganti: status revisi di chat dan tanda
  // sinkronisasi berubah di server. Dipicu oleh perubahan, bukan oleh transisi "generating",
  // karena job yang cepat bisa selesai sebelum klien sempat melihatnya berjalan.
  const prdKey = `${prd.state.status}:${prd.state.document?.version ?? 0}`;
  const lastPrdKey = useRef(prdKey);
  useEffect(() => {
    if (prdKey === lastPrdKey.current) return;
    lastPrdKey.current = prdKey;
    if (!prdKey.startsWith("generating:")) void reload();
  }, [prdKey, reload]);

  // Penyesuaian selesai tanpa usulan: beri tahu bahwa fitur sudah sesuai (kalau tidak, tidak ada
  // yang berubah di layar dan pengguna tidak tahu tombolnya sudah bekerja).
  const wasReconciling = useRef(sync.reconciling);
  useEffect(() => {
    const ended = wasReconciling.current && !sync.reconciling;
    wasReconciling.current = sync.reconciling;
    const proposed = sync.pending.some((p) => p.scope === "prd-to-features");
    if (ended && !sync.prd.dirty && !proposed) toast.success(revisionCopy.sync.upToDate);
  }, [sync]);

  // Polling selama "Sesuaikan fitur dengan PRD" berjalan.
  useEffect(() => {
    if (!sync.reconciling) return;
    const timer = setTimeout(async () => {
      const result = await apiRequest<SyncStatus>(`/api/plan/sync/status?${query}`);
      setSync((current) => (result.ok ? result.data : { ...current }));
    }, SYNC_POLL_MS);
    return () => clearTimeout(timer);
  }, [sync, query]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      setError(null);
      setRestore(null);
      setPending({ text: "", parts: [] });
      const controller = new AbortController();
      abort.current = controller;
      const result = await postStream(
        "/api/plan/chat",
        { planId, text: trimmed },
        controller.signal,
      );
      if (!result.ok) {
        setPending(null);
        setError(result.error.error);
        setRestore(trimmed);
        return;
      }
      let finished = false;
      try {
        for await (const event of result.events) {
          if (!isStreamEvent(event)) continue;
          if (event.type === "user") {
            setMessages((current) => [...current, event.message]);
          } else if (event.type === "text") {
            setPending(
              (current) => current && { ...current, text: current.text + event.text },
            );
          } else if (event.type === "part") {
            // Teks sebelum tindakan menjadi potongan sendiri, sama seperti yang disimpan server.
            setPending(
              (current) =>
                current && {
                  text: "",
                  parts: [
                    ...current.parts,
                    ...(current.text.trim()
                      ? [{ type: "text" as const, text: current.text }]
                      : []),
                    event.part,
                  ],
                },
            );
            if (event.part.type === "prd-revision" && event.part.status === "running") {
              void prd.reload();
            }
          } else if (event.type === "done") {
            finished = true;
            setMessages((current) => [...current, event.message]);
          } else {
            finished = true;
            setError(event.error);
            setRestore(trimmed);
            // Pesan pengguna dihapus server saat model gagal sebelum menjawab.
            setMessages((current) =>
              current.at(-1)?.role === "user" ? current.slice(0, -1) : current,
            );
          }
        }
      } catch {
        // Koneksi putus atau dihentikan pengguna: muat ulang yang tersimpan di server.
      } finally {
        abort.current = null;
        setPending(null);
        if (!finished) void reload();
        else {
          const status = await apiRequest<SyncStatus>(`/api/plan/sync/status?${query}`);
          if (status.ok) setSync(status.data);
        }
      }
    },
    [pending, planId, prd, query, reload],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const decide = useCallback(
    async (proposalId: string, accept: boolean): Promise<string | null> => {
      setBusyProposal(proposalId);
      const result = await postJson<{
        proposal: Proposal;
        sync: SyncStatus;
        changed?: number;
      }>(accept ? "/api/plan/sync/apply" : "/api/plan/sync/reject", { proposalId });
      setBusyProposal(null);
      if (!result.ok) {
        void reload();
        return result.error.error;
      }
      setMessages((current) => withProposal(current, result.data.proposal));
      setSync(result.data.sync);
      return null;
    },
    [reload],
  );

  const syncAction = useCallback(
    async (url: string): Promise<string | null> => {
      const result = await postJson<SyncStatus>(url, { planId });
      if (!result.ok) return result.error.error;
      setSync(result.data);
      return null;
    },
    [planId],
  );

  return {
    messages,
    sync,
    pending,
    error,
    restore,
    busyProposal,
    send,
    stop,
    accept: (id: string) => decide(id, true),
    reject: (id: string) => decide(id, false),
    reconcile: () => syncAction("/api/plan/sync/features"),
    dismiss: () => syncAction("/api/plan/sync/dismiss"),
    clearError: () => setError(null),
  };
}

export type RevisionController = ReturnType<typeof useRevision>;
