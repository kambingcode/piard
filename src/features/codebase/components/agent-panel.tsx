"use client";

import { AlertTriangle, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/patterns/copy-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api-client";
import { buildAgentPrompt } from "../agent-prompt";
import { codebaseCopy } from "../copy";
import type { AnalysisStatus, CodebaseLanguage } from "../schemas";
import { codebaseApi } from "./codebase-api";

const copy = codebaseCopy.ui.agent;
/** Selang memeriksa apakah kiriman agen sudah masuk (kiriman agen tidak lewat job, jadi tanpa SSE). */
const POLL_MS = 5_000;

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );

/**
 * Jalur agen (M7-08, M7-13): token sekali tampil, prompt untuk Claude Code yang langsung berisi token,
 * pratinjau prompt, dan "Tempel hasil" bila agen tidak bisa mengirim lewat curl. Token mentah hanya ada
 * di memori komponen ini; memuat ulang halaman berarti membuat token baru.
 */
export function AgentPanel({
  codebaseId,
  projectName,
  language,
  baseUrl,
  local,
  tokenExpiresAt,
  waiting,
}: {
  codebaseId: string;
  projectName: string;
  language: CodebaseLanguage;
  baseUrl: string;
  local: boolean;
  /** Masa berlaku token aktif (tanpa tokennya), atau null. */
  tokenExpiresAt: string | null;
  /** Belum ada dokumentasi dari agen: halaman memeriksa berkala sampai kiriman masuk. */
  waiting: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [token, setToken] = useState<{ value: string; expiresAt: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const prompt = buildAgentPrompt({
    projectName,
    language,
    baseUrl,
    token: token?.value ?? null,
  });
  const activeUntil = token?.expiresAt ?? tokenExpiresAt;

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const result = await apiRequest<AnalysisStatus>(
        `/api/codebase/${codebaseId}/status`,
      );
      if (result.ok && result.data.status === "ready") router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, codebaseId, router]);

  async function createToken() {
    setCreating(true);
    const result = await codebaseApi.createToken(codebaseId);
    setCreating(false);
    if (!result.ok) {
      toast.error(result.error.error);
      return;
    }
    setToken({ value: result.data.token, expiresAt: result.data.expiresAt });
  }

  async function revoke() {
    const result = await codebaseApi.revokeToken(codebaseId);
    if (!result.ok) {
      toast.error(result.error.error);
      return;
    }
    setToken(null);
    toast.success(copy.revoked);
    router.refresh();
  }

  async function paste() {
    if (pasting || markdown.trim() === "") return;
    setPasting(true);
    setPasteError(null);
    const result = await codebaseApi.importMarkdown(codebaseId, markdown);
    setPasting(false);
    if (!result.ok) {
      setPasteError(result.error.error);
      return;
    }
    setMarkdown("");
    toast.success(copy.pasted(result.data.added.length));
    if (result.data.proposed.length > 0)
      toast(copy.pastedProposed(result.data.proposed.length));
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby={`${id}-token`} className="space-y-3">
        <h3
          id={`${id}-token`}
          className="flex items-center gap-2 text-base font-semibold"
        >
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          {copy.tokenTitle}
        </h3>
        <p className="text-sm text-muted-foreground">
          {activeUntil ? copy.tokenActive(formatTime(activeUntil)) : copy.tokenNone}
        </p>
        {token ? (
          <output className="block rounded-control bg-muted px-4 py-3 text-sm">
            {copy.tokenOnce}
          </output>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {token ? (
            <CopyButton text={prompt} size="md">
              {copy.copyPrompt}
            </CopyButton>
          ) : null}
          <Button
            type="button"
            variant={token ? "secondary" : "primary"}
            onClick={() => void createToken()}
            disabled={creating}
          >
            {creating ? copy.creating : activeUntil ? copy.createNew : copy.create}
          </Button>
          {activeUntil ? (
            <Button type="button" variant="ghost" onClick={() => void revoke()}>
              {copy.revoke}
            </Button>
          ) : null}
        </div>
        {!token ? (
          <p className="text-xs text-muted-foreground">{copy.copyNeedsToken}</p>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-prompt`} className="space-y-3">
        <h3 id={`${id}-prompt`} className="text-base font-semibold">
          {copy.promptTitle}
        </h3>
        <p className="text-sm text-muted-foreground">{copy.promptHint}</p>
        {local ? (
          <p className="flex gap-2 rounded-control bg-muted px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>{copy.localWarning}</span>
          </p>
        ) : null}
        <details className="group rounded-card border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">
            {copy.previewToggle}
          </summary>
          <pre className="max-h-96 overflow-auto border-t border-border p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
            {prompt}
          </pre>
        </details>
      </section>

      <section aria-labelledby={`${id}-paste`} className="space-y-3">
        <h3 id={`${id}-paste`} className="text-base font-semibold">
          {copy.pasteTitle}
        </h3>
        <p className="text-sm text-muted-foreground">{copy.pasteBody}</p>
        <div className="space-y-2">
          <Label htmlFor={`${id}-markdown`}>{copy.pasteLabel}</Label>
          <Textarea
            id={`${id}-markdown`}
            value={markdown}
            spellCheck={false}
            aria-invalid={pasteError ? true : undefined}
            aria-describedby={pasteError ? `${id}-paste-error` : undefined}
            onChange={(event) => setMarkdown(event.target.value)}
            className="min-h-40 font-mono text-[13px] md:text-[13px]"
          />
          {pasteError ? (
            <p id={`${id}-paste-error`} className="text-sm text-negative">
              {pasteError}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void paste()}
          disabled={pasting || markdown.trim() === ""}
        >
          {pasting ? copy.pasting : copy.pasteSubmit}
        </Button>
      </section>
    </div>
  );
}
