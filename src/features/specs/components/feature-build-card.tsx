"use client";

import { ChevronDown, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/patterns/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PrdMarkdown } from "@/features/prd";
import type { RoadmapFeature, RoadmapSubFeature } from "@/features/roadmap";
import {
  DESCRIPTION_MAX_LENGTH,
  PROMPT_MAX_LENGTH,
  type Task,
  TITLE_MAX_LENGTH,
} from "@/features/tasks";
import { cn } from "@/lib/cn";
import { specsCopy } from "../copy";

const copy = specsCopy;

/** Aksi baris sekunder: ikon saja (baris task tetap ringan), nama lengkap untuk pembaca layar dan tooltip. */
function IconAction({
  label,
  tooltip,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="text-muted-foreground hover:text-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

type TaskDraftFields = { title: string; description: string; prompt: string };

/** Editor di tempat: judul, deskripsi, prompt. Esc membatalkan, Ctrl/⌘+Enter menyimpan. */
function TaskEditor({
  task,
  onSave,
  onClose,
}: {
  task: Task;
  onSave: (patch: TaskDraftFields) => Promise<string | null>;
  onClose: () => void;
}) {
  const ids = `task-${task.id}`;
  const [draft, setDraft] = useState<TaskDraftFields>({
    title: task.title,
    description: task.description,
    prompt: task.prompt,
  });
  const [saving, setSaving] = useState(false);
  const titleMissing = draft.title.trim() === "";

  async function save() {
    if (titleMissing || saving) return;
    setSaving(true);
    const problem = await onSave({
      title: draft.title.trim(),
      description: draft.description.trim(),
      prompt: draft.prompt.trim(),
    });
    setSaving(false);
    if (problem) {
      toast.error(problem);
      return;
    }
    toast.success(copy.task.saved);
    onClose();
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pintasan Esc dan Ctrl/⌘+Enter untuk seluruh editor
    <div
      className="mt-3 space-y-3 sm:ml-9"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-title`}>{copy.task.fields.title}</Label>
        <Input
          id={`${ids}-title`}
          value={draft.title}
          maxLength={TITLE_MAX_LENGTH}
          aria-invalid={titleMissing ? true : undefined}
          aria-describedby={titleMissing ? `${ids}-title-error` : undefined}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        {titleMissing ? (
          <p id={`${ids}-title-error`} className="text-sm text-negative">
            {copy.task.titleRequired}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-description`}>{copy.task.fields.description}</Label>
        <Textarea
          id={`${ids}-description`}
          className="min-h-20"
          value={draft.description}
          maxLength={DESCRIPTION_MAX_LENGTH}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-prompt`}>{copy.task.fields.prompt}</Label>
        <Textarea
          id={`${ids}-prompt`}
          className="min-h-48 font-mono text-[13px] leading-relaxed"
          value={draft.prompt}
          maxLength={PROMPT_MAX_LENGTH}
          onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={titleMissing || saving}
          onClick={() => void save()}
        >
          {saving ? copy.task.saving : copy.task.save}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
          {copy.task.cancel}
        </Button>
      </div>
    </div>
  );
}

function TaskItem({
  task,
  index,
  disabled,
  onSave,
  onRemove,
}: {
  task: Task;
  index: number;
  disabled: boolean;
  onSave: (patch: TaskDraftFields) => Promise<string | null>;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const promptId = `prompt-${task.id}`;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="tabular w-6 shrink-0 pt-0.5 text-sm text-muted-foreground">
          {index + 1}.
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{task.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>
        </div>
        <div className="flex flex-wrap gap-1 pl-9 sm:pl-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={promptId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? copy.task.hidePrompt : copy.task.showPrompt}
          </Button>
          <CopyButton text={task.prompt} label={`${copy.task.copy}: ${task.title}`}>
            {copy.task.copy}
          </CopyButton>
          <IconAction
            label={copy.task.editLabel(task.title)}
            tooltip={copy.task.edit}
            disabled={disabled || editing}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden />
          </IconAction>
          <IconAction
            label={copy.task.removeLabel(task.title)}
            tooltip={copy.task.remove}
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </IconAction>
        </div>
      </div>
      {editing ? (
        <TaskEditor task={task} onSave={onSave} onClose={() => setEditing(false)} />
      ) : open ? (
        <pre
          id={promptId}
          className="mt-3 ml-9 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-control bg-muted p-4 font-mono text-[13px] leading-relaxed"
        >
          {task.prompt}
        </pre>
      ) : null}
    </li>
  );
}

/** Semua prompt fitur dalam satu teks, berurutan, untuk ditempel sekaligus ke AI coding agent. */
function allPrompts(tasks: Task[]): string {
  return tasks
    .map((task, i) => `## ${i + 1}. ${task.title}\n\n${task.prompt}`)
    .join("\n\n---\n\n");
}

/** Satu fitur: spesifikasi, sub-fitur (dilipat), dan task berurutan dengan prompt siap tempel. */
export function FeatureBuildCard({
  feature,
  subFeatures,
  tasks,
  complete,
  stale,
  working,
  disabled,
  onRegenerateTasks,
  onUpdateTask,
  onRemoveTask,
}: {
  feature: RoadmapFeature;
  subFeatures: RoadmapSubFeature[];
  tasks: Task[];
  complete: boolean;
  /** Fitur berubah (usulan diterima) sesudah spesifikasi dan task-nya dibuat. */
  stale: boolean;
  working: boolean;
  disabled: boolean;
  onRegenerateTasks: () => Promise<string | null>;
  onUpdateTask: (id: string, patch: TaskDraftFields) => Promise<string | null>;
  onRemoveTask: (task: Task) => void;
}) {
  const [subsOpen, setSubsOpen] = useState(false);
  const headingId = `feature-${feature.id}`;
  return (
    <section aria-labelledby={headingId} className="rounded-card bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold tracking-[-0.01em]">
            {feature.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {feature.phase ? `${copy.feature.phase(feature.phase)} · ` : ""}
            {feature.summary}
          </p>
        </div>
        {working ? (
          <span className="flex items-center gap-1.5 text-sm text-accent">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
            {copy.feature.working}
          </span>
        ) : !complete ? (
          <span className="rounded-chip bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {copy.feature.pending}
          </span>
        ) : stale ? (
          <span className="flex-none rounded-chip bg-warning-soft px-2 py-0.5 text-xs font-medium">
            {copy.feature.stale}
          </span>
        ) : null}
      </div>

      {feature.spec ? (
        // Kartu selebar kerangka plan (1200px); teks spesifikasi dibatasi lebar baca.
        <PrdMarkdown
          content={feature.spec}
          headingOffset={0}
          className="mt-4 max-w-[75ch]"
        />
      ) : null}

      {subFeatures.length > 0 ? (
        <div className="mt-5">
          <button
            type="button"
            aria-expanded={subsOpen}
            onClick={() => setSubsOpen((v) => !v)}
            className="flex min-h-11 items-center gap-1.5 rounded-chip text-sm font-medium md:min-h-0"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-150",
                subsOpen && "rotate-180",
              )}
              aria-hidden
            />
            {copy.feature.subFeatures(subFeatures.length)}
          </button>
          {subsOpen ? (
            <ul className="mt-3 space-y-4 border-l-2 border-border pl-4">
              {subFeatures.map((sub) => (
                <li key={sub.id}>
                  <p className="font-medium">{sub.name}</p>
                  {sub.spec ? (
                    <PrdMarkdown
                      content={sub.spec}
                      headingOffset={0}
                      className="mt-1 max-w-[75ch] text-sm"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {copy.feature.noSpec}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {tasks.length > 0 ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">
              {copy.feature.tasks(tasks.length)}
            </h3>
            <div className="flex flex-wrap gap-1">
              <CopyButton
                text={allPrompts(tasks)}
                label={copy.task.copyAllLabel(feature.name)}
              >
                {copy.task.copyAll}
              </CopyButton>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={async () => {
                  const problem = await onRegenerateTasks();
                  if (problem) toast.error(problem);
                }}
              >
                <RefreshCw aria-hidden />
                {copy.feature.regenerateTasks}
              </Button>
            </div>
          </div>
          <ol className="mt-1 divide-y divide-border">
            {tasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                index={index}
                disabled={disabled}
                onSave={(patch) => onUpdateTask(task.id, patch)}
                onRemove={() => onRemoveTask(task)}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
