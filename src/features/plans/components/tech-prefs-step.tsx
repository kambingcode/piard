"use client";

import { Check, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiRequest } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import { plansCopy } from "../copy";
import { AI_CHOICE, type Plan, TECH_AREAS, type TechArea } from "../schemas";
import { EXTRA_OPTIONS, TECH_OPTIONS } from "../tech-options";
import { SaveIndicator } from "./save-indicator";
import { useAutosave } from "./use-autosave";

type Mode = "ai" | "own";
type Tech = Record<TechArea, string>;
type Payload = { techStack: Tech; extras: string[] };

const QUESTIONS_STEP = 3;
const allAi = (): Tech => ({
  backend: AI_CHOICE,
  database: AI_CHOICE,
  frontend: AI_CHOICE,
  deployment: AI_CHOICE,
});

function fullTech(stack: Plan["techStack"]): Tech {
  return {
    backend: stack.backend ?? AI_CHOICE,
    database: stack.database ?? AI_CHOICE,
    frontend: stack.frontend ?? AI_CHOICE,
    deployment: stack.deployment ?? AI_CHOICE,
  };
}

/**
 * Pilihan satu bidang; nilai yang tersimpan tetapi tidak ada di daftar (mis. teknologi terdeteksi dari
 * proyek eksisting seperti "Drizzle") ditambahkan agar tetap tampil terpilih.
 */
function optionsFor(area: TechArea, current: string): string[] {
  const options = TECH_OPTIONS[area];
  return current === AI_CHOICE || options.includes(current)
    ? options
    : [current, ...options];
}

const initialMode = (plan: Plan): Mode =>
  plan.extras.length > 0 ||
  Object.values(fullTech(plan.techStack)).some((v) => v !== AI_CHOICE)
    ? "own"
    : "ai";

async function patchPlan(planId: string, body: unknown): Promise<void> {
  const result = await apiRequest(`/api/plan/${planId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!result.ok) throw new Error(result.error.error);
}

function ModeCard({
  selected,
  title,
  body,
  onSelect,
}: {
  selected: boolean;
  title: string;
  body: string;
  onSelect: () => void;
}) {
  return (
    <Choice
      type="radio"
      name="tech-mode"
      checked={selected}
      onChange={onSelect}
      className="rounded-card p-5"
    >
      <span className="flex items-center justify-between gap-3 text-base font-semibold">
        {title}
        {selected ? <Check className="size-4" aria-hidden /> : null}
      </span>
      <span className="mt-1 block text-sm text-muted-foreground">{body}</span>
    </Choice>
  );
}

/**
 * Langkah 2: "Biarkan AI pilih" atau "Pilih sendiri" (backend, database, frontend, deployment,
 * fitur tambahan). Setiap perubahan tersimpan otomatis; "Lanjut" menyimpan lalu membuka pertanyaan.
 */
export function TechPrefsStep({
  plan,
  lockedFrom,
}: {
  plan: Plan;
  /** Nama proyek eksisting asal plan (M7-18): teknologi terisi dari proyek itu dan dikunci. */
  lockedFrom?: string;
}) {
  const copy = plansCopy.tech;
  const [locked, setLocked] = useState(Boolean(lockedFrom));
  const router = useRouter();
  const hydrated = useHydrated();
  const [mode, setMode] = useState<Mode>(() => initialMode(plan));
  const [tech, setTech] = useState<Tech>(() => fullTech(plan.techStack));
  const [extras, setExtras] = useState<string[]>(plan.extras);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { status, schedule, flush } = useAutosave<Payload>((payload) =>
    patchPlan(plan.id, payload),
  );

  /** Mode AI selalu menyimpan "ai-pilih" untuk semua bidang; pilihan sendiri tetap diingat di layar. */
  function save(nextMode: Mode, nextTech: Tech, nextExtras: string[]) {
    schedule(
      nextMode === "ai"
        ? { techStack: allAi(), extras: [] }
        : { techStack: nextTech, extras: nextExtras },
    );
  }

  function chooseMode(next: Mode) {
    setMode(next);
    save(next, tech, extras);
  }

  function changeArea(area: TechArea, value: string) {
    const next = { ...tech, [area]: value };
    setTech(next);
    save(mode, next, extras);
  }

  function toggleExtra(option: string) {
    const next = extras.includes(option)
      ? extras.filter((e) => e !== option)
      : [...extras, option];
    setExtras(next);
    save(mode, tech, next);
  }

  async function next() {
    setAdvancing(true);
    setError(null);
    try {
      if (!(await flush())) throw new Error(plansCopy.saveStatus.error);
      await patchPlan(plan.id, { step: Math.max(plan.step, QUESTIONS_STEP) });
      router.push(`/plans/${plan.id}?step=${QUESTIONS_STEP}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : plansCopy.errors.generic);
      setAdvancing(false);
    }
  }

  return (
    <section aria-labelledby="tech-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="tech-title" className="text-xl font-semibold tracking-tight">
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <SaveIndicator status={status} />
      </div>

      {lockedFrom && locked ? (
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3 rounded-card bg-muted px-5 py-4 text-sm">
          <div className="flex min-w-0 gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">{copy.locked.title(lockedFrom)}</p>
              <p className="mt-1 text-muted-foreground">{copy.locked.body}</p>
            </div>
          </div>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="secondary" size="sm">
                {copy.locked.unlock}
              </Button>
            }
            title={copy.locked.confirmTitle}
            body={copy.locked.confirmBody}
            confirm={copy.locked.confirm}
            cancel={copy.locked.cancel}
            onConfirm={() => setLocked(false)}
          />
        </div>
      ) : null}

      <fieldset className="mt-6 grid gap-3 sm:grid-cols-2" disabled={locked}>
        <legend className="sr-only">{copy.title}</legend>
        <ModeCard
          selected={mode === "ai"}
          title={copy.modeAi.title}
          body={copy.modeAi.body}
          onSelect={() => chooseMode("ai")}
        />
        <ModeCard
          selected={mode === "own"}
          title={copy.modeOwn.title}
          body={copy.modeOwn.body}
          onSelect={() => chooseMode("own")}
        />
      </fieldset>

      {mode === "own" ? (
        <div className="mt-8 space-y-8">
          <div className="grid gap-5 sm:grid-cols-2">
            {TECH_AREAS.map((area) => (
              <div key={area} className="space-y-2">
                <Label htmlFor={`tech-${area}`}>{copy.areas[area]}</Label>
                <Select
                  id={`tech-${area}`}
                  value={tech[area]}
                  disabled={locked}
                  onChange={(event) => changeArea(area, event.target.value)}
                >
                  <option value={AI_CHOICE}>{copy.aiChoice}</option>
                  {optionsFor(area, tech[area]).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          <fieldset>
            <legend className="text-sm font-medium">{copy.extrasTitle}</legend>
            <p className="mt-1 text-sm text-muted-foreground">{copy.extrasHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXTRA_OPTIONS.map((option) => {
                const checked = extras.includes(option);
                return (
                  <Choice
                    key={option}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleExtra(option)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm md:min-h-9"
                    selectedClassName="border-foreground bg-foreground text-background"
                    idleClassName="border-control-border bg-card hover:bg-muted"
                  >
                    {checked ? <Check className="size-3.5" aria-hidden /> : null}
                    {option}
                  </Choice>
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-control bg-negative-soft px-3.5 py-2.5 text-sm text-negative"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/plans/${plan.id}?step=1`)}
        >
          {plansCopy.wizard.back}
        </Button>
        <Button type="button" onClick={next} disabled={!hydrated || advancing}>
          {copy.next}
        </Button>
      </div>
    </section>
  );
}
