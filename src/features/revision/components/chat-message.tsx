"use client";

import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { PrdMarkdown } from "@/features/prd";
import { revisionCopy } from "../copy";
import type { ChatMessage, ChatPart } from "../schemas";
import { ProposalCard } from "./proposal-card";
import type { RevisionController } from "./use-revision";

const copy = revisionCopy;

type Actions = Pick<RevisionController, "accept" | "reject" | "busyProposal">;

function RevisionStatus({ part }: { part: Extract<ChatPart, { type: "prd-revision" }> }) {
  if (part.status === "running") {
    return (
      <p className="flex gap-2 text-sm text-muted-foreground">
        <Loader2
          className="mt-0.5 size-4 flex-none animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        {copy.revision.running(part.summary)}
      </p>
    );
  }
  if (part.status === "done") {
    return (
      <p className="flex gap-2 text-sm font-medium">
        <CheckCircle2 className="mt-0.5 size-4 flex-none text-positive" aria-hidden />
        {part.version
          ? copy.revision.done(part.version)
          : copy.revision.running(part.summary)}
      </p>
    );
  }
  return (
    <div className="flex gap-2 text-sm">
      <AlertCircle className="mt-0.5 size-4 flex-none text-negative" aria-hidden />
      <div>
        <p className="font-medium">{copy.revision.failed}</p>
        {part.error ? <p className="mt-0.5 text-muted-foreground">{part.error}</p> : null}
      </div>
    </div>
  );
}

export function PartView({ part, actions }: { part: ChatPart; actions: Actions }) {
  // Model menulis Markdown (tebal, butir); ditampilkan dengan renderer yang sama dengan PRD.
  if (part.type === "text") return <PrdMarkdown content={part.text} headingOffset={0} />;
  if (part.type === "notice") {
    return (
      <p className="flex gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 flex-none" aria-hidden />
        {part.text}
      </p>
    );
  }
  if (part.type === "prd-revision") return <RevisionStatus part={part} />;
  return (
    <ProposalCard
      proposal={part.proposal}
      busy={actions.busyProposal === part.proposal.id}
      onAccept={actions.accept}
      onReject={actions.reject}
    />
  );
}

/** Satu pesan: milik pengguna di gelembung kanan, balasan AI sebagai teks biasa dengan kartu tindakan. */
export function ChatMessageView({
  message,
  actions,
}: {
  message: ChatMessage;
  actions: Actions;
}) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <li className="flex justify-end">
        <p className="sr-only">{copy.roles.user}:</p>
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-control bg-muted px-3.5 py-2.5 text-[15px] leading-relaxed">
          {text}
        </p>
      </li>
    );
  }
  return (
    <li className="space-y-3">
      <p className="sr-only">{copy.roles.assistant}:</p>
      {message.parts.map((part, index) => (
        // Potongan pesan tersimpan tidak punya id dan urutannya tetap.
        // biome-ignore lint/suspicious/noArrayIndexKey: urutan potongan tidak pernah berubah
        <PartView key={index} part={part} actions={actions} />
      ))}
    </li>
  );
}

/** Balasan yang sedang ditulis: tindakan yang sudah terjadi, lalu teks yang mengalir. */
export function PendingReplyView({
  text,
  parts,
  actions,
}: {
  text: string;
  parts: ChatPart[];
  actions: Actions;
}) {
  return (
    <li className="space-y-3" aria-live="off">
      <p className="sr-only">{copy.roles.assistant}:</p>
      {parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: potongan hanya bertambah di akhir
        <PartView key={index} part={part} actions={actions} />
      ))}
      {text ? (
        <PrdMarkdown content={text} streaming headingOffset={0} />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          {copy.composer.thinking}
        </p>
      )}
    </li>
  );
}
