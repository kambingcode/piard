"use client";

import { AlertTriangle, Bot, KeyRound, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { CopyButton } from "@/components/patterns/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type AgentConnection, buildSnippets } from "../connect-snippets";
import { agentBridgeCopy } from "../copy";
import {
  DEFAULT_TOKEN_TTL_DAYS,
  INSTRUCTIONS_MAX,
  TOKEN_LABEL_MAX,
  TOKEN_TTL_DAYS,
} from "../limits";
import type { AgentToken } from "../schemas";
import { agentBridgeApi } from "./agent-api";
import { formatTime } from "./time";

const copy = agentBridgeCopy.ui.connect;

function Snippet({ text, label }: { text: string; label: string }) {
  return (
    <div className="space-y-2">
      <pre className="overflow-x-auto rounded-control bg-muted px-3 py-2.5 text-xs leading-relaxed">
        <code>{text}</code>
      </pre>
      <CopyButton text={text}>{label}</CopyButton>
    </div>
  );
}

function TokenRow({ token, onRevoke }: { token: AgentToken; onRevoke: () => void }) {
  const t = copy.tokens;
  const state = token.revokedAt ? t.revoked : token.active ? t.active : t.expired;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-border bg-card px-4 py-3">
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-medium break-words">
          {token.label}{" "}
          <span
            className={
              token.active
                ? "rounded-chip bg-positive-soft px-1.5 py-0.5 text-xs text-foreground"
                : "rounded-chip bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            }
          >
            {state}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {t.created(formatTime(token.createdAt))}
        </p>
        <p className="text-xs text-muted-foreground">
          {t.lastUsed(token.lastUsedAt ? formatTime(token.lastUsedAt) : null)}
        </p>
        {token.active ? (
          <p className="text-xs text-muted-foreground">
            {t.expires(formatTime(token.expiresAt))}
          </p>
        ) : null}
      </div>
      {token.active ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-label={t.revokeLabel(token.label)}
          onClick={onRevoke}
        >
          {t.revoke}
        </Button>
      ) : null}
    </li>
  );
}

/**
 * "Hubungkan AI" (M8-08, M8-12): buat token (sekali tampil), cuplikan Claude Code siap salin, instruksi
 * proyek untuk agen, dan daftar token dengan cabut satu/semua. Token mentah hanya ada di memori
 * komponen ini selama dialog terbuka.
 */
export function ConnectAiDialog({
  planId,
  instructions,
  connection,
}: {
  planId: string;
  instructions: string | null;
  connection: AgentConnection;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string>(copy.defaultLabel);
  const [ttl, setTtl] = useState<number>(DEFAULT_TOKEN_TTL_DAYS);
  const [token, setToken] = useState<string | null>(null);
  const [tokens, setTokens] = useState<AgentToken[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(instructions ?? "");
  const [saved, setSaved] = useState(instructions ?? "");
  const snippets = buildSnippets(connection, token);

  const load = useCallback(async () => {
    const result = await agentBridgeApi.tokens(planId);
    if (result.ok) setTokens(result.data.tokens);
  }, [planId]);

  useEffect(() => {
    if (open) void load();
    // Token mentah dibuang saat dialog ditutup: tampil sekali.
    else setToken(null);
  }, [open, load]);

  async function create() {
    setBusy(true);
    const result = await agentBridgeApi.createToken(planId, label.trim(), ttl);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error.error);
      return;
    }
    setToken(result.data.token);
    toast.success(copy.created);
    await load();
  }

  async function revoke(tokenId: string) {
    const result = await agentBridgeApi.revokeToken(tokenId);
    if (!result.ok) toast.error(result.error.error);
    else toast.success(copy.tokens.revokedToast);
    await load();
  }

  async function saveInstructions() {
    setBusy(true);
    const result = await agentBridgeApi.saveInstructions(planId, text.trim());
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error.error);
      return;
    }
    setSaved(text.trim());
    toast.success(copy.instructions.saved);
  }

  const activeCount = tokens?.filter((t) => t.active).length ?? 0;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button type="button" variant="secondary">
          <Bot aria-hidden />
          {copy.open}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          aria-describedby={`${id}-intro`}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(560px,100vw)] flex-col bg-background shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">{copy.title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={copy.close}>
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-8 overflow-y-auto px-5 py-5">
            <div className="space-y-3">
              <p id={`${id}-intro`} className="text-sm text-muted-foreground">
                {copy.intro}
              </p>
              <p className="flex gap-2 rounded-control bg-warning-soft px-4 py-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{copy.warning}</span>
              </p>
            </div>

            <section aria-labelledby={`${id}-token`} className="space-y-4">
              <h3 id={`${id}-token`} className="text-sm font-semibold">
                {copy.steps.token}
              </h3>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-label`}>{copy.label}</Label>
                  <Input
                    id={`${id}-label`}
                    value={label}
                    maxLength={TOKEN_LABEL_MAX}
                    aria-describedby={`${id}-label-hint`}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                  <p id={`${id}-label-hint`} className="text-xs text-muted-foreground">
                    {copy.labelHint}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-ttl`}>{copy.ttl}</Label>
                  <Select
                    id={`${id}-ttl`}
                    value={String(ttl)}
                    onChange={(event) => setTtl(Number(event.target.value))}
                    className="min-w-32"
                  >
                    {TOKEN_TTL_DAYS.map((days) => (
                      <option key={days} value={days}>
                        {copy.ttlOption(days)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <Button
                type="button"
                disabled={busy || label.trim() === ""}
                onClick={() => void create()}
              >
                <KeyRound aria-hidden />
                {copy.create}
              </Button>
              {token ? (
                <div className="space-y-2 rounded-control border border-accent bg-card p-4">
                  <output className="block text-sm font-medium">{copy.tokenOnce}</output>
                  <Snippet text={token} label={copy.copyToken} />
                </div>
              ) : null}
            </section>

            <section aria-labelledby={`${id}-connect`} className="space-y-4">
              <h3 id={`${id}-connect`} className="text-sm font-semibold">
                {copy.steps.connect}
              </h3>
              <p className="text-sm text-muted-foreground">{copy.commandIntro}</p>
              <Snippet text={snippets.command} label={copy.copyCommand} />
              <details className="rounded-control border border-border bg-card">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                  {copy.mcpJsonSummary}
                </summary>
                <div className="space-y-3 border-t border-border px-4 py-3">
                  <p className="text-sm text-muted-foreground">{copy.mcpJsonIntro}</p>
                  <Snippet text={snippets.mcpJson} label={copy.copyMcpJson} />
                  <Snippet text={snippets.exportToken} label={copy.copyExport} />
                </div>
              </details>
              {connection.local ? null : (
                <p className="rounded-control bg-warning-soft px-4 py-3 text-sm">
                  {copy.remote}
                </p>
              )}
            </section>

            <section aria-labelledby={`${id}-use`} className="space-y-2">
              <h3 id={`${id}-use`} className="text-sm font-semibold">
                {copy.steps.use}
              </h3>
              <p className="text-sm text-muted-foreground">{copy.use}</p>
            </section>

            <section aria-labelledby={`${id}-instructions`} className="space-y-2">
              <h3 id={`${id}-instructions`} className="text-sm font-semibold">
                {copy.instructions.title}
              </h3>
              <p id={`${id}-instructions-hint`} className="text-sm text-muted-foreground">
                {copy.instructions.hint}
              </p>
              <Textarea
                aria-labelledby={`${id}-instructions`}
                aria-describedby={`${id}-instructions-hint`}
                value={text}
                maxLength={INSTRUCTIONS_MAX}
                placeholder={copy.instructions.placeholder}
                onChange={(event) => setText(event.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy || text.trim() === saved}
                onClick={() => void saveInstructions()}
              >
                {copy.instructions.save}
              </Button>
            </section>

            <section aria-labelledby={`${id}-tokens`} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={`${id}-tokens`} className="text-sm font-semibold">
                  {copy.tokens.title}
                </h3>
                {activeCount > 0 ? (
                  <ConfirmDialog
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-negative"
                      >
                        {copy.tokens.revokeAll}
                      </Button>
                    }
                    title={copy.tokens.revokeAllTitle}
                    body={copy.tokens.revokeAllBody}
                    confirm={copy.tokens.revokeAllConfirm}
                    cancel={copy.tokens.revokeAllCancel}
                    destructive
                    onConfirm={async () => {
                      const result = await agentBridgeApi.revokeAll(planId);
                      if (!result.ok) toast.error(result.error.error);
                      else toast.success(copy.tokens.revokedAll(result.data.revoked));
                      await load();
                    }}
                  />
                ) : null}
              </div>
              {tokens && tokens.length === 0 ? (
                <p className="text-sm text-muted-foreground">{copy.tokens.empty}</p>
              ) : (
                <ul className="space-y-2" aria-busy={tokens === null}>
                  {(tokens ?? []).map((t) => (
                    <TokenRow key={t.id} token={t} onRevoke={() => void revoke(t.id)} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
