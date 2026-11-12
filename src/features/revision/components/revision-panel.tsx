"use client";

import { ArrowUp, Square } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { revisionCopy } from "../copy";
import { MESSAGE_MAX_LENGTH } from "../schemas";
import { ChatMessageView, PendingReplyView } from "./chat-message";
import { SyncNotice } from "./sync-notice";
import type { RevisionController } from "./use-revision";

const copy = revisionCopy;

/** Jarak dari dasar (px) yang masih dianggap "di bawah" sehingga pesan baru ikut digulir. */
const STICK_PX = 80;

/**
 * Panel chat revisi: penanda sinkronisasi, riwayat, balasan yang mengalir, dan kotak pesan.
 * Tanpa PRD, kotak pesan dimatikan (chat bekerja di atas PRD terbaru).
 */
export function RevisionPanel({
  planId,
  revision,
  hasPrd,
  headerAction,
  className,
}: {
  planId: string;
  revision: RevisionController;
  hasPrd: boolean;
  headerAction?: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const { messages, pending, error, restore } = revision;
  const sending = pending !== null;

  useEffect(() => {
    if (restore) setText(restore);
  }, [restore]);

  // Ikut menggulir ke balasan baru selama pengguna berada di dekat dasar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dijalankan tiap isi berubah
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || sending || !hasPrd) return;
    void revision.send(text);
    setText("");
    stick.current = true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const actions = {
    accept: revision.accept,
    reject: revision.reject,
    busyProposal: revision.busyProposal,
  };

  return (
    <section
      aria-labelledby={titleId}
      className={cn("flex min-h-0 flex-col rounded-card bg-card", className)}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          {copy.panel.title}
        </h2>
        {headerAction}
      </header>

      <SyncNotice planId={planId} revision={revision} />

      <div
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        }}
        // Area gulir harus bisa dijangkau keyboard (axe scrollable-region-focusable).
        role="log"
        aria-label={copy.panel.messagesLabel}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: area gulir perlu fokus agar bisa digulir dengan keyboard
        tabIndex={0}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {hasPrd ? copy.panel.greeting : copy.panel.noPrd}
        </p>
        {hasPrd && messages.length === 0 && !sending ? (
          <ul className="flex flex-col items-start gap-2">
            {copy.panel.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  className="min-h-10 cursor-pointer rounded-control border border-control-border px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-muted"
                  onClick={() => void revision.send(suggestion)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <ol className="space-y-5">
          {messages.map((message) => (
            <ChatMessageView key={message.id} message={message} actions={actions} />
          ))}
          {pending ? (
            <PendingReplyView
              text={pending.text}
              parts={pending.parts}
              actions={actions}
            />
          ) : null}
        </ol>
        {error ? (
          <p
            role="alert"
            className="rounded-control bg-negative-soft px-3.5 py-2.5 text-sm text-negative"
          >
            {error}
          </p>
        ) : null}
      </div>

      <form onSubmit={submit} className="border-t border-border p-3">
        <label htmlFor={inputId} className="sr-only">
          {copy.composer.label}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={!hasPrd}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={2}
            placeholder={copy.composer.placeholder}
            aria-describedby={hintId}
            className="max-h-48 min-h-11 flex-1 resize-none rounded-control border border-control-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
          />
          {sending ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label={copy.composer.stop}
              onClick={revision.stop}
            >
              <Square aria-hidden />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="rounded-full"
              aria-label={copy.composer.send}
              disabled={!hasPrd || !text.trim()}
            >
              <ArrowUp aria-hidden />
            </Button>
          )}
        </div>
        <p id={hintId} className="mt-1.5 hidden text-xs text-muted-foreground md:block">
          {copy.composer.hint}
        </p>
      </form>
    </section>
  );
}
