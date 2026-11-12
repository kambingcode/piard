"use client";

import { FolderGit2, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { codebaseCopy } from "../copy";
import type { Codebase } from "../schemas";
import { codebaseHref } from "./codebase-api";
import { StatusChip } from "./codebase-header";
import { useCodebaseDeletion } from "./use-codebase-deletion";

const copy = codebaseCopy.ui.list;
export const EXISTING_FLOW_HREF = "/plan?flow=existing";

type Item = Codebase & { pages: number };

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(iso));

/** Daftar proyek eksisting (M7-17): status, jumlah halaman, sumber; hapus dengan Undo. */
export function CodebaseList({ codebases }: { codebases: Item[] }) {
  const { hidden, remove } = useCodebaseDeletion();
  const visible = codebases.filter((c) => !hidden.has(c.id));

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={FolderGit2}
        title={copy.emptyTitle}
        description={copy.emptyBody}
        action={
          <Button asChild>
            <Link href={EXISTING_FLOW_HREF}>{copy.add}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-card">
      {visible.map((codebase) => (
        <li
          key={codebase.id}
          className="group relative flex items-center gap-4 p-4 sm:p-5"
        >
          <div className="min-w-0 flex-1">
            <Link
              href={codebaseHref(codebase.id)}
              className="block truncate text-base font-medium after:absolute after:inset-0 hover:underline"
            >
              {codebase.name}
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <StatusChip status={codebase.status} />
              <span className="tabular">{copy.pages(codebase.pages)}</span>
              <span>{codebaseCopy.source[codebase.source]}</span>
              <span>{formatDate(codebase.updatedAt)}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative z-10"
            aria-label={copy.delete(codebase.name)}
            onClick={() => remove(codebase)}
          >
            <Trash2 aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Bagian "Proyek eksisting" di sidebar, terpisah dari riwayat plan (ikon dan judul sendiri). */
export function CodebaseHistory({ codebases }: { codebases: Codebase[] }) {
  const pathname = usePathname();
  const { hidden } = useCodebaseDeletion();
  const visible = codebases.filter((c) => !hidden.has(c.id));
  if (visible.length === 0) return null;
  return (
    <section aria-label={copy.sidebarTitle} className="mt-4">
      <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
        {copy.sidebarTitle}
      </h3>
      <ul>
        {visible.map((codebase) => {
          const active = pathname.startsWith(`/codebases/${codebase.id}`);
          return (
            <li key={codebase.id}>
              <Link
                href={codebaseHref(codebase.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-control py-2.5 pr-3 pl-3 text-sm leading-6 transition-colors",
                  active
                    ? "bg-active font-medium text-foreground"
                    : "text-muted-foreground hover:bg-active hover:text-foreground",
                )}
              >
                <FolderGit2 className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{codebase.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
