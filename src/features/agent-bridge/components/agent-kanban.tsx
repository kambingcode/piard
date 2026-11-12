"use client";

import { Bot, CircleHelp, Clock3, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/features/plans";
import { KanbanBoard, type Task } from "@/features/tasks";
import { useEventSource } from "@/lib/use-event-source";
import { useHydrated } from "@/lib/use-hydrated";
import { useNow } from "@/lib/use-now";
import type { AgentConnection } from "../connect-snippets";
import { agentBridgeCopy } from "../copy";
import { STALE_AFTER_MS } from "../limits";
import type { BoardCardMeta, BoardMeta } from "../schemas";
import { agentBridgeApi } from "./agent-api";
import { ConnectAiDialog } from "./connect-ai-dialog";
import { TaskDetailSheet } from "./task-detail-sheet";
import { ago } from "./time";

const copy = agentBridgeCopy.ui.card;
const MINUTE = 60_000;

/** Card `doing` milik agen tanpa kabar lebih dari ambang ADR 0017. */
export function isStale(
  task: Task,
  meta: BoardCardMeta | undefined,
  now: number | null,
): boolean {
  if (now === null || task.status !== "doing" || !task.agentTokenId) return false;
  const last = meta?.lastAgentAt ?? task.claimedAt;
  return last !== null && now - Date.parse(last) > STALE_AFTER_MS;
}

function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: "accent" | "warning" | "muted";
  icon: typeof Bot;
  children: string;
}) {
  const tones = {
    accent: "bg-accent-soft text-accent",
    warning: "bg-warning-soft text-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-chip px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Kanban dengan jembatan agen (M8-03, M8-07, M8-08, M8-11): kolom Review, penanda "AI" pada card yang
 * dikerjakan agen, "AI butuh jawaban", "Mungkin macet" + Lepas, Setujui/Minta perbaikan, detail card
 * dengan linimasa, dan "Hubungkan AI". Papan ikut berubah saat agen bekerja (SSE event `agent`).
 */
export function AgentKanban({
  plan,
  initial,
  features,
  connection,
}: {
  plan: Plan;
  initial: Task[];
  features: { id: string; name: string }[];
  connection: AgentConnection;
}) {
  // Waktu relatif hanya setelah hidrasi: jam server dan browser berbeda, teksnya akan tidak cocok.
  const clock = useNow(MINUTE);
  const now = useHydrated() ? clock : null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [tasks, setTasks] = useState(initial);
  const [meta, setMeta] = useState<BoardMeta["cards"]>({});
  const [open, setOpen] = useState<{ id: string; changes: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    const result = await agentBridgeApi.board(plan.id);
    if (result.ok) setMeta(result.data.cards);
  }, [plan.id]);

  // Meta dihitung ulang setiap status/klaim card berubah (oleh pengguna, agen, atau job).
  const signature = tasks.map((t) => `${t.id}:${t.status}:${t.agentTokenId}`).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` sengaja jadi pemicu.
  useEffect(() => {
    void loadMeta();
  }, [signature, loadMeta]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    void loadMeta();
  }, [loadMeta]);

  useEventSource<{ agent: unknown }>(
    `/api/plan/tasks/stream?planId=${encodeURIComponent(plan.id)}`,
    { agent: refresh },
  );

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const openTask = open ? byId.get(open.id) : undefined;

  async function act(task: Task, action: "approve" | "release") {
    setBusy(task.id);
    const result =
      action === "approve"
        ? await agentBridgeApi.review(task.id, { decision: "approve" })
        : await agentBridgeApi.release(task.id);
    setBusy(null);
    if (!result.ok) toast.error(result.error.error);
    else toast.success(action === "approve" ? copy.approved : copy.released);
    refresh();
  }

  return (
    <>
      <KanbanBoard
        plan={plan}
        initial={initial}
        features={features}
        refreshKey={refreshKey}
        onTasksChange={setTasks}
        headerActions={
          <ConnectAiDialog
            planId={plan.id}
            instructions={plan.agentInstructions}
            connection={connection}
          />
        }
        renderCardMeta={(task) => {
          const card = meta[task.id];
          const agentWorking = task.status === "doing" && task.agentTokenId;
          const stale = isStale(task, card, now);
          if (!agentWorking && !card?.openQuestion && !card?.notes) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agentWorking ? (
                <Chip tone="accent" icon={Bot}>
                  {`${card?.tokenLabel ? copy.ai(card.tokenLabel) : copy.aiUnknown}${
                    task.claimedAt && now !== null
                      ? ` · ${copy.claimedAgo(ago(task.claimedAt, now))}`
                      : ""
                  }`}
                </Chip>
              ) : null}
              {stale ? (
                <Chip tone="warning" icon={Clock3}>
                  {copy.stale}
                </Chip>
              ) : null}
              {card?.openQuestion ? (
                <Chip tone="warning" icon={CircleHelp}>
                  {copy.question}
                </Chip>
              ) : null}
              {card?.notes ? (
                <Chip tone="muted" icon={MessageSquareText}>
                  {copy.notes(card.notes)}
                </Chip>
              ) : null}
            </div>
          );
        }}
        renderCardActions={(task) => (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={copy.detailLabel(task.title)}
              onClick={() => setOpen({ id: task.id, changes: false })}
            >
              {copy.detail}
            </Button>
            {task.status === "review" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  aria-label={copy.approveLabel(task.title)}
                  disabled={busy === task.id}
                  onClick={() => void act(task, "approve")}
                >
                  {copy.approve}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setOpen({ id: task.id, changes: true })}
                >
                  {copy.changes}
                </Button>
              </>
            ) : null}
            {isStale(task, meta[task.id], now) ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={copy.releaseLabel(task.title)}
                disabled={busy === task.id}
                onClick={() => void act(task, "release")}
              >
                {copy.release}
              </Button>
            ) : null}
          </>
        )}
      />
      <TaskDetailSheet
        task={openTask}
        featureName={features.find((f) => f.id === openTask?.featureId)?.name ?? ""}
        meta={openTask ? meta[openTask.id] : undefined}
        stale={openTask ? isStale(openTask, meta[openTask.id], now) : false}
        focusChanges={open?.changes ?? false}
        onClose={() => setOpen(null)}
        onChanged={refresh}
      />
    </>
  );
}
