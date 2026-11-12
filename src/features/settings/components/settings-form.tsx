"use client";

import { CircleCheck, CircleDashed, RotateCcw } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mapTasks } from "@/lib/ai-models";
import { apiRequest } from "@/lib/api-client";
import type { ValidationIssue } from "@/lib/api-error";
import { settingsCopy } from "../copy";
import {
  AI_TASKS,
  type AiTask,
  MODEL_SUGGESTIONS,
  type SettingsView,
  type UpdateSettingsInput,
} from "../schemas";

const copy = settingsCopy;
const SUGGESTIONS_ID = "model-suggestions";

type Draft = { models: Record<AiTask, string>; dailyUsd: string; monthlyUsd: string };
type Errors = Partial<Record<string, string>>;

const usdText = (value: number | null) => (value === null ? "" : String(value));

function toDraft(view: SettingsView): Draft {
  return {
    models: mapTasks((task) => view.models[task].value),
    dailyUsd: usdText(view.budget.dailyUsd.value),
    monthlyUsd: usdText(view.budget.monthlyUsd.value),
  };
}

/** "" = tanpa batas; koma desimal gaya Indonesia diterima. `undefined` = bukan angka. */
function parseUsd(text: string): number | null | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function issuesToErrors(issues: ValidationIssue[] | undefined): Errors {
  return Object.fromEntries((issues ?? []).map((issue) => [issue.path, issue.message]));
}

function ChangedBadge() {
  return (
    <span className="rounded-chip bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
      {copy.changed}
    </span>
  );
}

function Field({
  id,
  label,
  hint,
  changed,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  changed: boolean;
  error: string | undefined;
  children: (describedBy: string) => ReactNode;
}) {
  const describedBy = error ? `${id}-hint ${id}-error` : `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {changed ? <ChangedBadge /> : null}
      </div>
      {children(describedBy)}
      <p
        id={`${id}-hint`}
        className="text-xs text-muted-foreground [overflow-wrap:anywhere]"
      >
        {hint}
      </p>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Formulir /settings: model per tugas, batas biaya, dan status kunci (tanpa nilainya). */
export function SettingsForm({ initial }: { initial: SettingsView }) {
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function apply(next: SettingsView) {
    setView(next);
    setDraft(toDraft(next));
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dailyUsd = parseUsd(draft.dailyUsd);
    const monthlyUsd = parseUsd(draft.monthlyUsd);
    if (dailyUsd === undefined || monthlyUsd === undefined) {
      setErrors({
        ...(dailyUsd === undefined ? { "budget.dailyUsd": copy.budget.invalid } : {}),
        ...(monthlyUsd === undefined ? { "budget.monthlyUsd": copy.budget.invalid } : {}),
      });
      return;
    }
    const body: UpdateSettingsInput = {
      models: draft.models,
      budget: { dailyUsd, monthlyUsd },
    };
    setSaving(true);
    const result = await apiRequest<SettingsView>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!result.ok) {
      const fieldErrors = issuesToErrors(result.error.issues);
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) toast.error(result.error.error);
      return;
    }
    apply(result.data);
    toast.success(copy.saved);
  }

  async function reset() {
    const result = await apiRequest<SettingsView>("/api/settings", { method: "DELETE" });
    if (!result.ok) {
      toast.error(result.error.error);
      return;
    }
    apply(result.data);
    toast.success(copy.reset.done);
  }

  const anyOverride =
    AI_TASKS.some((task) => view.models[task].overridden) ||
    view.budget.dailyUsd.overridden ||
    view.budget.monthlyUsd.overridden;

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      <p className="rounded-card bg-muted px-4 py-3 text-sm text-muted-foreground">
        {view.mode === "mock" ? copy.mode.mock : copy.mode.live}
      </p>

      <section aria-labelledby="settings-models" className="rounded-card bg-card p-5">
        <h2 id="settings-models" className="text-base font-semibold">
          {copy.models.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.models.hint}</p>
        <datalist id={SUGGESTIONS_ID}>
          {MODEL_SUGGESTIONS.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {AI_TASKS.map((task) => {
            const id = `model-${task}`;
            const error = errors[`models.${task}`];
            return (
              <Field
                key={task}
                id={id}
                label={copy.models.tasks[task]}
                hint={copy.models.env(view.models[task].envValue)}
                changed={view.models[task].overridden}
                error={error}
              >
                {(describedBy) => (
                  <Input
                    id={id}
                    name={id}
                    list={SUGGESTIONS_ID}
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.models[task]}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        models: { ...current.models, [task]: event.target.value },
                      }))
                    }
                  />
                )}
              </Field>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="settings-budget" className="rounded-card bg-card p-5">
        <h2 id="settings-budget" className="text-base font-semibold">
          {copy.budget.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.budget.hint}</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {(["dailyUsd", "monthlyUsd"] as const).map((key) => {
            const id = `budget-${key}`;
            const error = errors[`budget.${key}`];
            const envValue = view.budget[key].envValue;
            return (
              <Field
                key={key}
                id={id}
                label={key === "dailyUsd" ? copy.budget.daily : copy.budget.monthly}
                hint={copy.budget.env(
                  envValue === null ? copy.budget.unlimited : String(envValue),
                )}
                changed={view.budget[key].overridden}
                error={error}
              >
                {(describedBy) => (
                  <Input
                    id={id}
                    name={id}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={copy.budget.unlimited}
                    value={draft[key]}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                )}
              </Field>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="settings-keys" className="rounded-card bg-card p-5">
        <h2 id="settings-keys" className="text-base font-semibold">
          {copy.keys.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.keys.hint}</p>
        <dl className="mt-4 divide-y divide-border">
          {(["openrouter", "anthropic"] as const).map((provider) => {
            const set = view.keys[provider];
            const Icon = set ? CircleCheck : CircleDashed;
            return (
              <div
                key={provider}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
              >
                <dt className="font-mono text-sm">{copy.keys[provider]}</dt>
                <dd
                  className={
                    set
                      ? "flex items-center gap-1.5 text-sm text-positive"
                      : "flex items-center gap-1.5 text-sm text-muted-foreground"
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {set ? copy.keys.set : copy.keys.unset}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? copy.saving : copy.save}
        </Button>
        {anyOverride ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost">
                <RotateCcw aria-hidden />
                {copy.reset.action}
              </Button>
            }
            title={copy.reset.title}
            body={copy.reset.body}
            confirm={copy.reset.confirm}
            cancel={copy.reset.cancel}
            onConfirm={() => void reset()}
          />
        ) : null}
      </div>
    </form>
  );
}
