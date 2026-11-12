"use client";

import { GripVertical, ListChecks, RotateCcw } from "lucide-react";
import Link from "next/link";
import { type DragEvent, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { CopyButton } from "@/components/patterns/copy-button";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { Plan } from "@/features/plans";
import { cn } from "@/lib/cn";
import { tasksCopy } from "../copy";
import { TASK_STATUSES, type Task, type TaskStatus } from "../schemas";
import { useKanban } from "./use-kanban";

const copy = tasksCopy.kanban;
const DRAG_TYPE = "application/x-piard-task";

/** Nilai <select> status; opsi hanya berasal dari TASK_STATUSES, sisanya jatuh ke "todo". */
const toStatus = (value: string): TaskStatus =>
  TASK_STATUSES.find((status) => status === value) ?? "todo";

/** Isi tambahan dari fitur lain (jembatan agen) tanpa membuat fitur tasks bergantung padanya. */
export type KanbanSlots = {
  /** Aksi di kepala halaman, mis. "Hubungkan AI". */
  headerActions?: ReactNode;
  /** Penanda di bawah judul card, mis. "Dikerjakan AI", "AI butuh jawaban". */
  renderCardMeta?: (task: Task) => ReactNode;
  /** Aksi tambahan di baris aksi card, mis. Detail, Setujui. */
  renderCardActions?: (task: Task) => ReactNode;
  /** Berubah → papan dimuat ulang dari server. */
  refreshKey?: number;
  /** Dipanggil setiap daftar task di papan berubah. */
  onTasksChange?: (tasks: Task[]) => void;
};

function TaskCard({
  task,
  featureName,
  selected,
  onSelect,
  onMove,
  meta,
  actions,
}: {
  task: Task;
  featureName: string;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onMove: (status: TaskStatus) => void;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <li
      draggable
      data-task-id={task.id}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, task.id);
        event.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        "rounded-control border border-border bg-card p-3 transition-opacity duration-150",
        "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50",
        selected && "border-accent",
      )}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          aria-label={copy.select(task.title)}
          onChange={(event) => onSelect(event.target.checked)}
          className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{task.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{featureName}</p>
          {meta}
        </div>
        <GripVertical
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </div>
      {/* Menu status selebar kartu di baris sendiri; tombol di bawahnya mengalir dan hanya turun baris bila memang tak muat. */}
      <div className="mt-3 space-y-2">
        <Select
          aria-label={copy.moveLabel(task.title)}
          value={task.status}
          onChange={(event) => onMove(toStatus(event.target.value))}
          className="h-10 text-sm md:h-8"
        >
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {copy.columns[status]}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={task.prompt} label={copy.copyLabel(task.title)}>
            {copy.copy}
          </CopyButton>
          {actions}
        </div>
      </div>
    </li>
  );
}

/**
 * Kanban todo/dikerjakan/review/selesai: seret dan lepas, menu status per kartu, status massal, reset.
 * Slot (`KanbanSlots`) diisi fitur jembatan agen lewat halaman.
 */
export function KanbanBoard({
  plan,
  initial,
  features,
  headerActions,
  renderCardMeta,
  renderCardActions,
  refreshKey = 0,
  onTasksChange,
}: {
  plan: Plan;
  initial: Task[];
  features: { id: string; name: string }[];
} & KanbanSlots) {
  const { tasks, setStatus, reset } = useKanban(plan.id, initial, refreshKey);
  useEffect(() => {
    onTasksChange?.(tasks);
  }, [tasks, onTasksChange]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<TaskStatus>("done");
  const [over, setOver] = useState<TaskStatus | null>(null);
  const names = new Map(features.map((f) => [f.id, f.name]));
  const done = tasks.filter((t) => t.status === "done").length;

  async function move(ids: string[], status: TaskStatus) {
    const changed = ids.filter((id) => tasks.find((t) => t.id === id)?.status !== status);
    if (changed.length === 0) return;
    const problem = await setStatus(changed, status);
    if (problem) toast.error(problem);
    return problem;
  }

  function drop(event: DragEvent, status: TaskStatus) {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    if (id) void move([id], status);
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="w-full">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex min-h-10 min-w-0 items-center text-sm text-muted-foreground tabular">
            {copy.title} · {copy.meta(done, tasks.length)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {headerActions}
            {tasks.length > 0 ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost">
                    <RotateCcw aria-hidden />
                    {copy.reset.action}
                  </Button>
                }
                title={copy.reset.title}
                body={copy.reset.body}
                confirm={copy.reset.confirm}
                cancel={copy.reset.cancel}
                onConfirm={async () => {
                  const problem = await reset();
                  if (problem) toast.error(problem);
                  else toast.success(copy.reset.done);
                }}
              />
            ) : null}
          </div>
        </div>

        {tasks.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={ListChecks}
            headingLevel={2}
            title={copy.empty.title}
            description={copy.empty.body}
            action={
              <Button asChild>
                <Link href={`/plans/${plan.id}/tasks`}>{copy.empty.action}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <p className="mt-6 text-sm text-muted-foreground">{copy.dragHint}</p>

            {selected.size > 0 ? (
              <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-control bg-card px-4 py-3 shadow-lg">
                <output className="text-sm font-medium">
                  {copy.bulk.selected(selected.size)}
                </output>
                <Select
                  aria-label={copy.bulk.moveTo}
                  value={bulkStatus}
                  onChange={(event) => setBulkStatus(toStatus(event.target.value))}
                  className="h-10 w-auto min-w-36 text-sm"
                >
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {copy.columns[status]}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    const ids = [...selected];
                    const problem = await move(ids, bulkStatus);
                    if (!problem) {
                      toast.success(copy.bulk.done(ids.length));
                      setSelected(new Set());
                    }
                  }}
                >
                  {copy.bulk.apply}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                >
                  {copy.bulk.clear}
                </Button>
              </div>
            ) : null}

            {/*
              Kolom tidak boleh lebih sempit dari 252px (kartu 236px: status, "Salin prompt" + "Detail", dan
              "Setujui" + "Minta perbaikan" masing-masing muat satu baris). `xl` mengukur lebar layar, bukan
              area isi (rail + sidebar memakai ±316px), jadi `xl:grid-cols-4` membuat kolom 213px di layar
              1280px setelah kolom Review ditambahkan (M8). Kini papan bergulir ke samping di dalam dirinya
              sendiri bila empat kolom tidak muat (layar 1440px ke atas muat).
            */}
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-[minmax(252px,1fr)] xl:overflow-x-auto xl:pb-2">
              {TASK_STATUSES.map((status) => {
                const column = tasks.filter((t) => t.status === status);
                const headingId = `column-${status}`;
                return (
                  <section
                    key={status}
                    aria-labelledby={headingId}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                      event.preventDefault();
                      setOver(status);
                    }}
                    onDragLeave={(event) => {
                      const next = event.relatedTarget;
                      if (!(next instanceof Node && event.currentTarget.contains(next)))
                        setOver(null);
                    }}
                    onDrop={(event) => drop(event, status)}
                    className={cn(
                      "flex min-h-40 flex-col rounded-card bg-muted p-2 transition-colors duration-150",
                      over === status && "bg-active",
                    )}
                  >
                    <div className="flex items-baseline justify-between px-1 pb-3">
                      <h2 id={headingId} className="text-sm font-semibold">
                        {copy.columns[status]}
                      </h2>
                      <span className="tabular text-xs text-muted-foreground">
                        {copy.columnCount(column.length)}
                      </span>
                    </div>
                    {column.length === 0 ? (
                      <p className="rounded-control border border-dashed border-control-border px-3 py-6 text-center text-sm text-muted-foreground">
                        {copy.emptyColumn}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {column.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            featureName={names.get(task.featureId) ?? ""}
                            selected={selected.has(task.id)}
                            onSelect={(checked) => toggle(task.id, checked)}
                            onMove={(next) => void move([task.id], next)}
                            meta={renderCardMeta?.(task)}
                            actions={renderCardActions?.(task)}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
