"use client";

import { AlertDialog } from "radix-ui";
import { useDeferredValue, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PrdMarkdown } from "@/features/prd";
import { clearDraft, readDraft, writeDraft } from "@/lib/draft-storage";
import { codebaseCopy } from "../copy";
import { DOC_CONTENT_MAX_LENGTH } from "../schemas";

const copy = codebaseCopy.ui.editor;

/** Kunci draf per halaman: draf satu halaman tidak muncul di halaman lain. */
export const docDraftKey = (codebaseId: string, slug: string) =>
  `piard:codebase-doc:${codebaseId}:${slug}`;

/**
 * Edit Markdown satu halaman dokumentasi dengan pratinjau (M7-15). Draf disimpan otomatis di browser
 * selama mengetik, sehingga simpan yang gagal atau tab yang tertutup tidak membuang teks; draf dibuang
 * setelah tersimpan atau dibatalkan. Meninggalkan halaman dengan perubahan belum tersimpan diperingatkan.
 */
export function DocEditor({
  draftKey,
  initial,
  onSave,
  onClose,
}: {
  draftKey: string;
  initial: string;
  /** @returns pesan galat, atau `null` bila tersimpan. */
  onSave: (content: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const preview = useDeferredValue(draft);
  const dirty = draft !== initial;
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  // Draf lama dipulihkan sekali saat editor dibuka (localStorage hanya ada di browser).
  useEffect(() => {
    const saved = readDraft(draftKey);
    if (saved !== null && saved !== initial) {
      setDraft(saved);
      setRestored(true);
    }
  }, [draftKey, initial]);

  useEffect(() => {
    if (dirty) writeDraft(draftKey, draft);
    else clearDraft(draftKey);
  }, [dirty, draft, draftKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    const problem = await onSave(draft);
    setSaving(false);
    if (problem) {
      setError(problem);
      return;
    }
    clearDraft(draftKey);
  }

  function discard() {
    clearDraft(draftKey);
    onClose();
  }

  function cancel() {
    if (dirty) setConfirmDiscard(true);
    else discard();
  }

  return (
    <div className="space-y-4">
      {restored ? (
        <output className="block rounded-control bg-muted px-4 py-3 text-sm">
          {copy.draftRestored}
        </output>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-input`}>{copy.label}</Label>
          <Textarea
            id={`${id}-input`}
            value={draft}
            maxLength={DOC_CONTENT_MAX_LENGTH}
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void save();
              }
              if (event.key === "Escape") cancel();
            }}
            className="min-h-[55vh] flex-1 font-mono text-[13px] leading-relaxed md:text-[13px]"
          />
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-negative">
              {error}
            </p>
          ) : null}
          <p id={hintId} className="text-xs text-muted-foreground">
            {copy.hint}
          </p>
        </div>
        <section
          aria-label={copy.previewLabel}
          className="hidden max-h-[calc(55vh+2rem)] overflow-y-auto rounded-card bg-card p-6 xl:block"
        >
          <PrdMarkdown content={preview} />
        </section>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={cancel} disabled={saving}>
          {copy.cancel}
        </Button>
        <Button type="button" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? copy.saving : copy.save}
        </Button>
      </div>

      <AlertDialog.Root open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-card bg-card p-6 shadow-xl">
            <AlertDialog.Title className="text-lg font-semibold">
              {copy.discardTitle}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              {copy.discardBody}
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="secondary">
                  {copy.keepEditing}
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button type="button" variant="destructive" onClick={discard}>
                  {copy.discardConfirm}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
