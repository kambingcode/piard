"use client";

import { ArrowRight, Download, FileText, History } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/features/plans";
import { useHydrated } from "@/lib/use-hydrated";
import { prdCopy } from "../copy";
import type { PrdDocument, PrdState } from "../schemas";
import { PrdDiff } from "./prd-diff";
import { PrdEditor } from "./prd-editor";
import { PrdMarkdown } from "./prd-markdown";
import { PrdProgress } from "./prd-progress";
import { ModeToggle, type PrdMode, VersionSelect } from "./prd-toolbar";
import { RegeneratePrdDialog } from "./regenerate-prd-dialog";
import { type PrdController, usePrd } from "./use-prd";
import { usePrdVersions } from "./use-prd-versions";

const copy = prdCopy;

const savedAt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Halaman PRD: membuat PRD bila belum ada, progres dan teks yang mengalir, lalu dokumennya dengan
 * mode edit, pemilih versi, dan pemulihan versi lama. `aside` (panel chat revisi dari fitur lain)
 * menerima pengendali PRD agar bisa memuat ulang PRD setelah revisi dimulai; tidak tampil saat edit.
 */
export function PrdView({
  plan,
  initial,
  aside,
}: {
  plan: Plan;
  initial: PrdState;
  aside?: (prd: PrdController) => ReactNode;
}) {
  const controller = usePrd(plan.id, initial);
  const { state, setState, start, retryRevision } = controller;
  const latest = state.document;
  const history = usePrdVersions(plan.id, latest);
  const hydrated = useHydrated();
  const [mode, setMode] = useState<PrdMode>("preview");
  const [busy, setBusy] = useState(false);
  /** Saat membuka versi lama: tampilkan diff terhadap versi terbaru, bukan dokumennya. */
  const [compare, setCompare] = useState(false);
  const generating = state.status === "generating";
  const shown: PrdDocument | null = history.viewing ?? latest;
  const editing = mode === "edit" && latest !== null && !generating && !history.viewing;

  // Plan yang baru membuka halaman PRD langsung dibuatkan PRD (sekali; server juga idempoten).
  // Hanya bila belum pernah ada job: kegagalan sebelumnya menunggu "Coba lagi" dari pengguna.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || initial.status !== "idle" || initial.job !== null) return;
    autoStarted.current = true;
    void start();
  }, [initial.status, initial.job, start]);

  /** Versi baru dari server menjadi versi terbaru di layar. */
  function adopt(document: PrdDocument) {
    setState((current) => ({
      ...current,
      status: "ready",
      document,
      job: current.job ? { ...current.job, error: null } : null,
    }));
  }

  async function save(content: string): Promise<string | null> {
    const result = await history.save(content);
    if (!result.ok) return result.error;
    const unchanged = result.data.document.version === latest?.version;
    adopt(result.data.document);
    setMode("preview");
    toast.success(
      unchanged ? copy.editor.unchanged : copy.editor.saved(result.data.document.version),
    );
    return null;
  }

  async function openVersion(version: number) {
    setBusy(true);
    const result = await history.open(version);
    setBusy(false);
    if (!result.ok) toast.error(copy.history.loadFailed);
  }

  async function restore(version: number) {
    setBusy(true);
    const result = await history.restore(version);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    history.close();
    adopt(result.data.document);
    toast.success(copy.history.restored(version, result.data.document.version));
  }

  const revising = state.job?.kind === "revise";
  const side = aside && !editing ? aside(controller) : null;

  const main = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex min-h-10 min-w-0 items-center text-sm text-muted-foreground tabular">
          {shown && hydrated
            ? copy.meta(shown.version, savedAt.format(new Date(shown.createdAt)))
            : copy.documentLabel}
        </p>
        {latest ? (
          <div className="flex flex-wrap items-center gap-2">
            <VersionSelect
              versions={history.versions}
              current={shown?.version ?? latest.version}
              disabled={generating || editing || busy}
              onChange={(version) => void openVersion(version)}
            />
            <ModeToggle
              mode={editing ? "edit" : "preview"}
              disabled={generating || history.viewing !== null}
              onChange={setMode}
            />
            <Button asChild variant="secondary">
              <a
                href={`/api/plan/export?planId=${encodeURIComponent(plan.id)}&format=md${
                  history.viewing ? `&version=${history.viewing.version}` : ""
                }`}
                download
              >
                <Download aria-hidden />
                {copy.toolbar.download}
              </a>
            </Button>
            <RegeneratePrdDialog
              disabled={generating || editing}
              onConfirm={() => void start(true)}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-8 space-y-6">
        {generating ? <PrdProgress planId={plan.id} state={state} /> : null}

        {state.status === "failed" ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-negative-soft px-4 py-3"
          >
            <div className="text-sm">
              <p className="font-medium text-negative">
                {revising ? copy.failed.reviseTitle : copy.failed.title}
              </p>
              <p className="mt-0.5 text-negative">
                {state.job?.error ?? copy.errors.failed}
              </p>
              {latest ? (
                <p className="mt-0.5 text-foreground">
                  {copy.failed.keptVersion(latest.version)}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void (revising ? retryRevision() : start(latest !== null))}
            >
              {copy.failed.retry}
            </Button>
          </div>
        ) : null}

        {history.viewing && latest ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-muted px-4 py-3">
            <p className="flex items-center gap-2 text-sm">
              <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {copy.history.viewing(history.viewing.version, latest.version)}
            </p>
            <div className="flex flex-wrap gap-2">
              <fieldset className="flex gap-1">
                <legend className="sr-only">{copy.history.modeLabel}</legend>
                {([false, true] as const).map((diff) => (
                  <Button
                    key={String(diff)}
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-pressed={compare === diff}
                    className={compare === diff ? "bg-active" : undefined}
                    onClick={() => setCompare(diff)}
                  >
                    {diff ? copy.history.showDiff : copy.history.showDocument}
                  </Button>
                ))}
              </fieldset>
              <Button type="button" variant="ghost" size="sm" onClick={history.close}>
                {copy.history.backToLatest}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy || generating}
                onClick={() => void restore(history.viewing?.version ?? 0)}
              >
                {copy.history.restore}
              </Button>
            </div>
          </div>
        ) : null}

        {generating && state.draft ? (
          <article
            aria-label={copy.documentLabel}
            className="rounded-card bg-card p-6 md:p-10"
          >
            <PrdMarkdown content={state.draft} streaming />
          </article>
        ) : editing && latest ? (
          <div data-editing>
            <PrdEditor
              key={latest.version}
              initial={latest.content}
              onSave={save}
              onClose={() => setMode("preview")}
            />
          </div>
        ) : compare && history.viewing && latest && !generating ? (
          <PrdDiff
            before={history.viewing.content}
            after={latest.content}
            beforeVersion={history.viewing.version}
            afterVersion={latest.version}
          />
        ) : shown && !generating ? (
          <>
            <article
              aria-label={copy.documentLabel}
              className="rounded-card bg-card p-6 md:p-10"
            >
              <PrdMarkdown content={shown.content} />
            </article>
            {history.viewing ? null : (
              <div className="flex justify-end">
                <Button asChild>
                  <Link href={`/plans/${plan.id}/tasks`}>
                    {copy.next}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            )}
          </>
        ) : !generating && state.status !== "failed" ? (
          <EmptyState
            icon={FileText}
            headingLevel={2}
            title={copy.empty.title}
            description={copy.empty.body}
            action={
              <Button type="button" onClick={() => void start()}>
                {copy.empty.action}
              </Button>
            }
          />
        ) : null}
      </div>
    </div>
  );

  if (!side) return main;
  return (
    // Di bawah xl panel menjadi lembar; ruang bawah untuk tombol chat yang melayang.
    <div className="grid gap-8 pb-20 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:pb-0">
      {main}
      {side}
    </div>
  );
}
