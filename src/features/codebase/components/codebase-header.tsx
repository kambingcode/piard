"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { codebaseCopy } from "../copy";
import type { Codebase, CodebaseStatus } from "../schemas";
import { exportHref } from "./codebase-api";
import { useCodebaseDeletion } from "./use-codebase-deletion";

const STATUS_ICON: Record<CodebaseStatus, { icon: typeof Clock; className: string }> = {
  awaiting_source: { icon: Clock, className: "text-muted-foreground" },
  source_ready: { icon: Clock, className: "text-accent" },
  analyzing: { icon: Loader2, className: "text-accent motion-safe:animate-spin" },
  ready: { icon: CheckCircle2, className: "text-positive" },
  failed: { icon: XCircle, className: "text-negative" },
};

/** Status sebagai ikon + teks (warna tidak pernah satu-satunya penanda). */
export function StatusChip({ status }: { status: CodebaseStatus }) {
  const { icon: Icon, className } = STATUS_ICON[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-chip bg-muted px-2 py-1 text-xs font-medium">
      <Icon className={cn("size-3.5", className)} aria-hidden />
      {codebaseCopy.status[status]}
    </span>
  );
}

/** Kepala halaman proyek: kembali, nama (`h1`), status, aksi sekunder, dan hapus dengan Undo. */
export function CodebaseHeader({
  codebase,
  hasDocs,
  primaryAction,
}: {
  codebase: Codebase;
  hasDocs: boolean;
  /** Aksi utama halaman (mis. "Rencanakan fitur baru"), bila ada. */
  primaryAction?: ReactNode;
}) {
  const { remove } = useCodebaseDeletion();
  const copy = codebaseCopy.ui;
  return (
    <header className="space-y-4">
      <Link
        href="/codebases"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-chip text-sm text-muted-foreground hover:text-foreground md:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {copy.list.title}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] md:text-[32px]">
            {codebase.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusChip status={codebase.status} />
            <span>{copy.header.source(codebaseCopy.source[codebase.source])}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {primaryAction}
          {hasDocs ? (
            <Button asChild variant="secondary">
              <a href={exportHref(codebase.id)} download>
                <Download aria-hidden />
                {copy.header.downloadAll}
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={copy.list.delete(codebase.name)}
            title={copy.header.delete}
            onClick={() => remove(codebase)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
