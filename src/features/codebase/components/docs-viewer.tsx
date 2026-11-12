"use client";

import { Download, FilePlus2, GitCompare, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PrdMarkdown } from "@/features/prd";
import { cn } from "@/lib/cn";
import { slugify } from "@/lib/slug";
import { smoothScrollTo } from "@/lib/smooth-scroll";
import { codebaseCopy } from "../copy";
import { docFile, docFileName } from "../doc-file";
import {
  type CodebaseLanguage,
  DOC_PAGES,
  type DocSlug,
  type DocSummary,
  docTitle,
} from "../schemas";
import { codebaseApi, codebaseHref, type DocDetail } from "./codebase-api";
import { DocEditor, docDraftKey } from "./doc-editor";

const copy = codebaseCopy.ui.docs;
const proposalCopy = codebaseCopy.ui.proposal;

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );

function download(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Navigasi halaman: daftar di layar lebar, pilihan di ponsel. Halaman yang belum ada tetap tampil. */
function DocNav({
  codebaseId,
  language,
  docs,
  active,
}: {
  codebaseId: string;
  language: CodebaseLanguage;
  docs: DocSummary[];
  active: DocSlug;
}) {
  const router = useRouter();
  const id = useId();
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  return (
    <>
      <div className="space-y-2 lg:hidden">
        <Label htmlFor={`${id}-page`}>{copy.mobilePick}</Label>
        <Select
          id={`${id}-page`}
          value={active}
          onChange={(event) =>
            router.push(codebaseHref(codebaseId, event.target.value as DocSlug), {
              scroll: false,
            })
          }
        >
          {DOC_PAGES.map((page) => {
            const doc = bySlug.get(page.slug);
            return (
              <option key={page.slug} value={page.slug}>
                {page.title[language]}
                {doc ? "" : ` (${copy.missing.toLowerCase()})`}
              </option>
            );
          })}
        </Select>
      </div>
      {/* Tetap terlihat saat halaman panjang di-scroll; z di atas gradien tepi atas halaman. */}
      <nav
        aria-label={copy.navLabel}
        className="hidden lg:sticky lg:top-6 lg:z-30 lg:block lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto"
      >
        <ul className="space-y-0.5">
          {DOC_PAGES.map((page) => {
            const doc = bySlug.get(page.slug);
            const current = page.slug === active;
            return (
              <li key={page.slug}>
                <Link
                  href={codebaseHref(codebaseId, page.slug)}
                  aria-current={current ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "flex min-h-9 items-center justify-between gap-2 rounded-control px-3 py-1.5 text-sm transition-colors",
                    current
                      ? "bg-active font-medium text-foreground"
                      : doc
                        ? "text-foreground hover:bg-active"
                        : "text-muted-foreground hover:bg-active",
                  )}
                >
                  <span className="truncate">{page.title[language]}</span>
                  <span className="flex shrink-0 gap-1 text-xs text-muted-foreground">
                    {doc?.hasProposal ? (
                      <span className="rounded-chip bg-accent-soft px-1.5 text-accent">
                        {copy.proposalBadge}
                      </span>
                    ) : doc?.edited ? (
                      <span>{copy.editedBadge}</span>
                    ) : null}
                    {doc ? null : <span>{copy.missing}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** Usulan analisis ulang: bandingkan berdampingan, lalu terima atau tolak (M7-16). */
function ProposalReview({
  codebaseId,
  detail,
  disabled,
}: {
  codebaseId: string;
  detail: DocDetail;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const proposal = detail.proposal;
  if (!proposal) return null;
  const origin = codebaseCopy.origin[proposal.origin];

  async function resolve(action: "accept" | "reject") {
    setBusy(true);
    const result = await codebaseApi.resolveProposal(
      codebaseId,
      detail.page.slug,
      action,
    );
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error.error);
      return;
    }
    toast.success(action === "accept" ? proposalCopy.accepted : proposalCopy.rejected);
    router.refresh();
  }

  return (
    <section
      aria-label={proposalCopy.title}
      className="rounded-card bg-accent-soft px-5 py-4 text-sm"
    >
      <p className="font-medium">{proposalCopy.title}</p>
      <p className="mt-1 text-muted-foreground">{proposalCopy.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <GitCompare aria-hidden />
          {proposalCopy.compare}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || disabled}
          onClick={() => void resolve("accept")}
        >
          {proposalCopy.accept}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || disabled}
          onClick={() => void resolve("reject")}
        >
          {proposalCopy.reject}
        </Button>
      </div>
      {open ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 rounded-card bg-card p-5">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              {proposalCopy.current(detail.page.version)}
            </p>
            <PrdMarkdown content={detail.page.content} />
          </div>
          <div className="min-w-0 rounded-card bg-card p-5">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              {proposalCopy.proposed(origin)}
            </p>
            <PrdMarkdown content={proposal.content} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Penampil dokumentasi proyek (M7-14) dengan edit manual dan riwayat versi (M7-15) serta usulan analisis
 * ulang (M7-16). Halaman aktif dari `?page=` (tautan bisa dibagikan); isi terbaru dirender server,
 * versi lama diambil saat dipilih.
 */
export function DocsViewer({
  codebaseId,
  projectName,
  language,
  docs,
  active,
  detail,
  busy,
}: {
  codebaseId: string;
  projectName: string;
  language: CodebaseLanguage;
  docs: DocSummary[];
  active: DocSlug;
  /** Versi terbaru halaman aktif, atau null bila halaman belum ada. */
  detail: DocDetail | null;
  /** Analisis sedang berjalan: edit dan pulihkan dinonaktifkan (server menjawab 409). */
  busy: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [old, setOld] = useState<DocDetail | null>(null);
  const [restoring, setRestoring] = useState(false);
  const title = docTitle(active, language);

  // Pindah halaman menutup editor dan tampilan versi lama (state disesuaikan saat render, bukan lewat
  // efek, agar tidak ada satu render dengan editor halaman lama).
  const [shownFor, setShownFor] = useState(active);
  if (shownFor !== active) {
    setShownFor(active);
    setEditing(false);
    setOld(null);
  }

  // Pindah halaman mulai dari atas; navigasi memakai `scroll={false}` agar perilakunya seragam di
  // tautan samping dan pilihan ponsel. Muat awal dibiarkan (mis. kembali lewat tombol back).
  // Pembatal disimpan di ref, bukan dikembalikan dari efek: efek ini jalan tiap render, dan render
  // ulang (mis. `router.refresh`) tidak boleh memutus animasi di tengah jalan.
  const scrolledFor = useRef(active);
  const cancelScroll = useRef<() => void>(() => {});
  useEffect(() => {
    if (scrolledFor.current === active) return;
    scrolledFor.current = active;
    cancelScroll.current();
    cancelScroll.current = smoothScrollTo(0);
  });
  useEffect(() => () => cancelScroll.current(), []);

  async function pickVersion(value: string) {
    const version = Number(value);
    if (!detail || version === detail.page.version) {
      setOld(null);
      return;
    }
    const result = await codebaseApi.doc(codebaseId, active, version);
    if (!result.ok) {
      toast.error(result.error.error);
      return;
    }
    setOld(result.data);
  }

  async function save(content: string): Promise<string | null> {
    const result = await codebaseApi.saveDoc(codebaseId, active, content);
    if (!result.ok) return result.error.error;
    setEditing(false);
    toast.success(copy.saved);
    router.refresh();
    return null;
  }

  async function restore() {
    if (!old) return;
    setRestoring(true);
    const result = await codebaseApi.restoreDoc(codebaseId, active, old.page.version);
    setRestoring(false);
    if (!result.ok) {
      toast.error(result.error.error);
      return;
    }
    toast.success(copy.restored(old.page.version));
    setOld(null);
    router.refresh();
  }

  if (docs.length === 0 && !editing) {
    return (
      <EmptyState
        icon={FilePlus2}
        title={copy.empty.title}
        description={copy.empty.body}
      />
    );
  }

  const shown = old ?? detail;
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <DocNav codebaseId={codebaseId} language={language} docs={docs} active={active} />

      <article aria-labelledby={`${id}-title`} className="min-w-0">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-[-0.02em]">
              {title}
            </h2>
            {shown ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.origin(
                  codebaseCopy.origin[shown.page.origin],
                  shown.page.version,
                  formatDate(shown.page.createdAt),
                )}
              </p>
            ) : null}
          </div>
          {detail && !editing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                title={busy ? copy.busy : undefined}
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden />
                {copy.edit}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  download(
                    docFileName(slugify(projectName, "proyek"), active),
                    docFile(title, (shown ?? detail).page.content),
                  )
                }
              >
                <Download aria-hidden />
                {copy.download}
              </Button>
            </div>
          ) : null}
        </header>

        {detail && detail.versions.length > 1 && !editing ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Label htmlFor={`${id}-version`} className="text-sm text-muted-foreground">
              {copy.history}
            </Label>
            <Select
              id={`${id}-version`}
              value={String(shown?.page.version ?? detail.page.version)}
              onChange={(event) => void pickVersion(event.target.value)}
              className="w-auto"
            >
              {detail.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {copy.versionOption(
                    v.version,
                    codebaseCopy.origin[v.origin],
                    formatDate(v.createdAt),
                  )}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {old ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control bg-muted px-4 py-3 text-sm">
            <output className="flex-1">{copy.viewing(old.page.version)}</output>
            <Button
              type="button"
              size="sm"
              disabled={restoring || busy}
              onClick={() => void restore()}
            >
              {restoring ? copy.restoring : copy.restore}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOld(null)}>
              {copy.backToLatest}
            </Button>
          </div>
        ) : null}

        {detail && !editing && !old ? (
          <div className="mt-4">
            <ProposalReview codebaseId={codebaseId} detail={detail} disabled={busy} />
          </div>
        ) : null}

        <div className="mt-6">
          {editing ? (
            <DocEditor
              draftKey={docDraftKey(codebaseId, active)}
              initial={detail?.page.content ?? ""}
              onSave={save}
              onClose={() => setEditing(false)}
            />
          ) : shown ? (
            <PrdMarkdown content={shown.page.content} />
          ) : (
            <EmptyState
              icon={FilePlus2}
              title={copy.missingTitle}
              description={copy.missingBody}
              action={
                <Button type="button" disabled={busy} onClick={() => setEditing(true)}>
                  {copy.write}
                </Button>
              }
            />
          )}
        </div>
      </article>
    </div>
  );
}
