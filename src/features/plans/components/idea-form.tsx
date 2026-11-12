"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/api-client";
import { clearDraft, readDraft, writeDraft } from "@/lib/draft-storage";
import { useHydrated } from "@/lib/use-hydrated";
import { plansCopy } from "../copy";
import { IDEA_MAX_LENGTH, LANGUAGES, type Plan, type PlanLanguage } from "../schemas";
import { EXISTING_PLAN_HREF } from "./plan-landing";

const FIRST_WIZARD_PATH = (id: string) => `/plans/${id}?step=2`;
/** Penghitung karakter baru muncul mendekati batas, agar tidak mengganggu. */
const COUNTER_THRESHOLD = 0.8;
/** Ide yang belum dikirim diingat per browser (doc 08: memori ide terakhir). */
const DRAFT_KEY = "piard:idea-draft";

/** Proyek eksisting asal plan fitur baru (M7-18), disiapkan halaman dari fitur codebase. */
export type IdeaFormCodebase = { id: string; name: string; language: PlanLanguage };

/**
 * Form ide di `/plan?flow=new`: satu aksi utama, nonaktif saat kosong (doc 07 R2). Dengan `codebase`
 * menjadi form fitur baru untuk proyek eksisting ("Mau menambah apa?"); draf diingat per proyek.
 */
export function IdeaForm({ codebase }: { codebase?: IdeaFormCodebase } = {}) {
  const copy = plansCopy.ideaForm;
  const draftKey = codebase ? `${DRAFT_KEY}:${codebase.id}` : DRAFT_KEY;
  const router = useRouter();
  const hydrated = useHydrated();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [idea, setIdea] = useState("");
  const [language, setLanguage] = useState<PlanLanguage>(codebase?.language ?? "id");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // Dibaca setelah hidrasi agar HTML server dan klien sama.
  useEffect(() => {
    const draft = readDraft(draftKey);
    if (draft) {
      setIdea((current) => current || draft);
      setRestored(true);
    }
  }, [draftKey]);

  function changeIdea(next: string) {
    setIdea(next);
    writeDraft(draftKey, next);
  }

  const canSubmit = hydrated && !pending && idea.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await postJson<{ plan: Plan }>("/api/plan/create", {
      idea: idea.trim(),
      language,
      ...(codebase ? { codebaseId: codebase.id } : {}),
    });
    if (result.ok) {
      clearDraft(draftKey);
      router.push(FIRST_WIZARD_PATH(result.data.plan.id));
      return;
    }
    setError(result.error.issues?.[0]?.message ?? result.error.error);
    setPending(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  }

  function fillExample(example: string) {
    changeIdea(example);
    textareaRef.current?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
        {codebase ? copy.feature.title : copy.title}
      </h1>
      <p className="mt-3 max-w-[52ch] text-base text-muted-foreground">
        {codebase ? copy.feature.subtitle(codebase.name) : copy.subtitle}
      </p>

      <form method="post" onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="idea">{codebase ? copy.feature.label : copy.label}</Label>
          <Textarea
            id="idea"
            name="idea"
            ref={textareaRef}
            value={idea}
            onChange={(event) => changeIdea(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={codebase ? copy.feature.placeholder : copy.placeholder}
            maxLength={IDEA_MAX_LENGTH}
            className="min-h-44"
            aria-describedby="idea-hint"
            autoFocus
          />
          <p
            id="idea-hint"
            className="flex justify-between gap-3 text-xs text-muted-foreground"
          >
            <span>{restored && idea ? copy.draftRestored : copy.shortcut}</span>
            {idea.length >= IDEA_MAX_LENGTH * COUNTER_THRESHOLD ? (
              <span className="tabular">
                {copy.counter(idea.length, IDEA_MAX_LENGTH)}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full space-y-2 sm:w-56">
            <Label htmlFor="language">{copy.languageLabel}</Label>
            <Select
              id="language"
              name="language"
              value={language}
              onChange={(event) => {
                const chosen = LANGUAGES.find((code) => code === event.target.value);
                if (chosen) setLanguage(chosen);
              }}
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {copy.languages[code]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="lg" disabled={!canSubmit} className="sm:min-w-44">
            {pending ? copy.submitting : copy.submit}
          </Button>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-control bg-negative-soft px-3.5 py-2.5 text-sm text-negative"
          >
            {error}
          </p>
        ) : null}
      </form>

      {codebase ? null : (
        <>
          <section className="mt-10" aria-labelledby="examples-title">
            <h2 id="examples-title" className="text-sm font-medium text-muted-foreground">
              {copy.examplesTitle}
            </h2>
            <ul className="mt-3 space-y-2">
              {copy.examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => fillExample(example)}
                    className="w-full cursor-pointer rounded-control border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-10 text-sm text-muted-foreground">
            {copy.existing}{" "}
            <Link
              href={EXISTING_PLAN_HREF}
              className="font-medium text-accent underline-offset-4 hover:underline"
            >
              {copy.existingLink}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
