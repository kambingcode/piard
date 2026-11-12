"use client";

import { Bot, User, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { CopyButton } from "@/components/patterns/copy-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type Task, tasksCopy } from "@/features/tasks";
import type { ApiResult } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { agentBridgeCopy } from "../copy";
import { NOTE_MAX } from "../limits";
import type { BoardCardMeta, TaskEvent, TaskNote } from "../schemas";
import { agentBridgeApi } from "./agent-api";
import { formatTime } from "./time";

const copy = agentBridgeCopy.ui.detail;

/** Markdown laporan/catatan: tanpa HTML mentah (bawaan react-markdown), tautan keluar aman. */
function NoteBody({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm break-words [&_code]:rounded-chip [&_code]:bg-muted [&_code]:px-1 [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

function NoteItem({ note }: { note: TaskNote }) {
  const agent = note.author === "agent";
  const Icon = agent ? Bot : User;
  const who = agent ? copy.agent(note.tokenLabel) : copy.you;
  if (note.kind === "event") {
    const text = agentBridgeCopy.events[note.body as TaskEvent] ?? note.body; // body event = kode TASK_EVENTS.
    return (
      <li className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span>
          {who} · {text} ·{" "}
          <time dateTime={note.createdAt}>{formatTime(note.createdAt)}</time>
        </span>
      </li>
    );
  }
  return (
    <li
      className={cn(
        "rounded-control border p-3",
        note.kind === "question"
          ? "border-warning bg-warning-soft"
          : "border-border bg-card",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium text-foreground">{who}</span>
        <span>· {copy.kinds[note.kind]}</span>
        <time dateTime={note.createdAt}>· {formatTime(note.createdAt)}</time>
      </div>
      <NoteBody text={note.body} />
    </li>
  );
}

/**
 * Detail card (M8-07): status, tinjauan untuk card Review (Setujui / Minta perbaikan dengan catatan),
 * lepas card agen, deskripsi dan prompt, linimasa catatan, dan kotak catatan/jawaban.
 */
export function TaskDetailSheet({
  task,
  featureName,
  meta,
  stale,
  focusChanges,
  onClose,
  onChanged,
}: {
  task: Task | undefined;
  featureName: string;
  meta: BoardCardMeta | undefined;
  stale: boolean;
  focusChanges: boolean;
  onClose: () => void;
  /** Card berubah dari sini (tinjauan, catatan): papan dimuat ulang. */
  onChanged: () => void;
}) {
  const id = useId();
  const [notes, setNotes] = useState<TaskNote[] | null>(null);
  const [note, setNote] = useState("");
  const [changes, setChanges] = useState("");
  const [busy, setBusy] = useState(false);
  const changesRef = useRef<HTMLTextAreaElement>(null);
  const taskId = task?.id;
  const noteCount = meta?.notes ?? 0;

  const load = useCallback(async () => {
    if (!taskId) return;
    const result = await agentBridgeApi.notes(taskId);
    if (result.ok) setNotes(result.data.notes);
  }, [taskId]);

  // Dimuat ulang saat card dibuka dan saat agen menambah catatan (jumlah di meta berubah).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `noteCount` dan status sengaja jadi pemicu.
  useEffect(() => {
    void load();
  }, [load, noteCount, task?.status]);

  useEffect(() => {
    if (!taskId) {
      setNotes(null);
      setNote("");
      setChanges("");
    }
  }, [taskId]);

  async function run(action: () => Promise<ApiResult<unknown>>, done: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error.error);
      return false;
    }
    toast.success(done);
    onChanged();
    await load();
    return true;
  }

  const status = task ? tasksCopy.kanban.columns[task.status] : "";
  const agentWorking = task?.status === "doing" && task.agentTokenId;

  return (
    <Dialog.Root open={task !== undefined} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (!focusChanges) return;
            event.preventDefault();
            changesRef.current?.focus();
          }}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(520px,100vw)] flex-col bg-background shadow-xl"
        >
          {task ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{copy.title}</p>
                  <Dialog.Title className="text-base font-semibold text-balance">
                    {task.title}
                  </Dialog.Title>
                </div>
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy.close}
                  >
                    <X aria-hidden />
                  </Button>
                </Dialog.Close>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{copy.status}</dt>
                  <dd className="font-medium">{status}</dd>
                  <dt className="text-muted-foreground">{copy.feature}</dt>
                  <dd className="min-w-0 truncate">{featureName}</dd>
                </dl>

                {agentWorking ? (
                  <div className="space-y-3 rounded-control bg-accent-soft px-4 py-3 text-sm">
                    <p>
                      {copy.claimedBy(
                        meta?.tokenLabel ?? "",
                        task.claimedAt ? formatTime(task.claimedAt) : "",
                      )}
                    </p>
                    {stale ? (
                      <>
                        <p>{copy.staleHint}</p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => agentBridgeApi.release(task.id),
                              agentBridgeCopy.ui.card.released,
                            )
                          }
                        >
                          {agentBridgeCopy.ui.card.release}
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {task.status === "review" ? (
                  <section
                    aria-labelledby={`${id}-review`}
                    className="space-y-3 rounded-card border border-border bg-card p-4"
                  >
                    <h3 id={`${id}-review`} className="text-sm font-semibold">
                      {copy.review.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{copy.review.body}</p>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => agentBridgeApi.review(task.id, { decision: "approve" }),
                          agentBridgeCopy.ui.card.approved,
                        )
                      }
                    >
                      {copy.review.approve}
                    </Button>
                    <form
                      className="space-y-2"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const ok = await run(
                          () =>
                            agentBridgeApi.review(task.id, {
                              decision: "changes",
                              note: changes,
                            }),
                          copy.review.changesSent,
                        );
                        if (ok) setChanges("");
                      }}
                    >
                      <Label htmlFor={`${id}-changes`}>{copy.review.changesLabel}</Label>
                      <Textarea
                        id={`${id}-changes`}
                        ref={changesRef}
                        value={changes}
                        maxLength={NOTE_MAX}
                        placeholder={copy.review.changesPlaceholder}
                        onChange={(event) => setChanges(event.target.value)}
                        className="min-h-20"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={busy || changes.trim().length < 3}
                      >
                        {copy.review.changesSubmit}
                      </Button>
                    </form>
                  </section>
                ) : null}

                {task.description.trim() ? (
                  <section>
                    <h3 className="text-sm font-semibold">{copy.description}</h3>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                      {task.description}
                    </p>
                  </section>
                ) : null}

                <details className="rounded-control border border-border bg-card">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                    {copy.prompt}
                  </summary>
                  <div className="space-y-3 border-t border-border px-4 py-3">
                    <pre className="max-h-72 overflow-auto text-xs whitespace-pre-wrap">
                      {task.prompt}
                    </pre>
                    <CopyButton text={task.prompt}>{copy.copyPrompt}</CopyButton>
                  </div>
                </details>

                <section aria-labelledby={`${id}-timeline`}>
                  <h3 id={`${id}-timeline`} className="text-sm font-semibold">
                    {copy.timeline}
                  </h3>
                  {notes && notes.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {copy.emptyTimeline}
                    </p>
                  ) : (
                    <ol className="mt-3 space-y-3" aria-busy={notes === null}>
                      {(notes ?? []).map((n) => (
                        <NoteItem key={n.id} note={n} />
                      ))}
                    </ol>
                  )}
                </section>
              </div>

              <form
                className="space-y-2 border-t border-border px-5 py-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const ok = await run(
                    () => agentBridgeApi.addNote(task.id, note),
                    copy.composer.sent,
                  );
                  if (ok) setNote("");
                }}
              >
                <Label htmlFor={`${id}-note`}>
                  {meta?.openQuestion ? copy.composer.answerLabel : copy.composer.label}
                </Label>
                <Textarea
                  id={`${id}-note`}
                  value={note}
                  maxLength={NOTE_MAX}
                  placeholder={copy.composer.placeholder}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-16"
                />
                <Button type="submit" size="sm" disabled={busy || note.trim() === ""}>
                  {copy.composer.submit}
                </Button>
              </form>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
