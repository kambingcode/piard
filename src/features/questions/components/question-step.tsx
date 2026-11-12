"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type AnswerValue,
  type ClarifyingQuestion,
  type Plan,
  plansCopy,
  SaveIndicator,
  useAutosave,
} from "@/features/plans";
import { apiRequest } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import {
  type Answers,
  hasAnswer,
  multiOtherText,
  resumeIndex,
  singleOtherText,
  skippedValue,
  toggleOption,
  withMultiOther,
} from "../answers";
import { questionsCopy } from "../copy";
import { GenerateQuestions } from "./generate-questions";

const TECH_STEP = 2;
const ROADMAP_STEP = 4;
const OTHER_MAX_LENGTH = 500;

async function patchPlan(planId: string, body: unknown): Promise<void> {
  const result = await apiRequest(`/api/plan/${planId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!result.ok) throw new Error(result.error.error);
}

/** Elemen yang sudah punya arti untuk Enter (mengikuti tautan, menekan tombol, baris baru). */
function ownsEnterKey(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("a, button, textarea, select, summary") !== null
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    ? target.type === "text"
    : target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

type AnswerInputProps = {
  question: ClarifyingQuestion;
  answers: Answers;
  onChange: (value: AnswerValue) => void;
  otherOpen: boolean;
  onOtherOpen: (open: boolean) => void;
};

function OptionRow({
  index,
  label,
  selected,
}: {
  index: number;
  label: string;
  selected: boolean;
}) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className="hidden size-6 shrink-0 items-center justify-center rounded-chip bg-muted text-xs font-medium text-muted-foreground tabular md:flex"
      >
        {index}
      </span>
      <span className="flex-1 text-base md:text-sm">{label}</span>
      {selected ? <Check className="size-4 shrink-0" aria-hidden /> : null}
    </span>
  );
}

function SingleChoice({
  question,
  answers,
  onChange,
  otherOpen,
  onOtherOpen,
}: AnswerInputProps) {
  const value = answers[question.id];
  const otherText = singleOtherText(question, answers);
  const otherSelected = otherOpen || otherText !== "";
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{question.question}</legend>
      {question.options.map((option, i) => (
        <Choice
          key={option}
          type="radio"
          name={question.id}
          checked={!otherSelected && value === option}
          onChange={() => {
            onOtherOpen(false);
            onChange(option);
          }}
          className="min-h-12 rounded-control px-4 py-3"
        >
          <OptionRow
            index={i + 1}
            label={option}
            selected={!otherSelected && value === option}
          />
        </Choice>
      ))}
      <Choice
        type="radio"
        name={question.id}
        checked={otherSelected}
        onChange={() => {
          onOtherOpen(true);
          onChange("");
        }}
        className="min-h-12 rounded-control px-4 py-3"
      >
        <OptionRow
          index={question.options.length + 1}
          label={questionsCopy.other}
          selected={otherSelected}
        />
      </Choice>
      {otherSelected ? (
        <Input
          autoFocus
          aria-label={questionsCopy.other}
          placeholder={questionsCopy.otherPlaceholder}
          maxLength={OTHER_MAX_LENGTH}
          value={otherText}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
    </fieldset>
  );
}

function MultiChoice({
  question,
  answers,
  onChange,
  otherOpen,
  onOtherOpen,
}: AnswerInputProps) {
  const value = answers[question.id];
  const otherText = multiOtherText(question, answers);
  const otherSelected = otherOpen || otherText !== "";
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{question.question}</legend>
      <p className="text-sm text-muted-foreground">{questionsCopy.multiHint}</p>
      {question.options.map((option, i) => {
        const checked = Array.isArray(value) && value.includes(option);
        return (
          <Choice
            key={option}
            type="checkbox"
            checked={checked}
            onChange={() => onChange(toggleOption(value, option))}
            className="min-h-12 rounded-control px-4 py-3"
          >
            <OptionRow index={i + 1} label={option} selected={checked} />
          </Choice>
        );
      })}
      <Choice
        type="checkbox"
        checked={otherSelected}
        onChange={() => {
          if (otherSelected) {
            onOtherOpen(false);
            onChange(withMultiOther(question, answers, ""));
          } else {
            onOtherOpen(true);
          }
        }}
        className="min-h-12 rounded-control px-4 py-3"
      >
        <OptionRow
          index={question.options.length + 1}
          label={questionsCopy.other}
          selected={otherSelected}
        />
      </Choice>
      {otherSelected ? (
        <Input
          autoFocus
          aria-label={questionsCopy.other}
          placeholder={questionsCopy.otherPlaceholder}
          maxLength={OTHER_MAX_LENGTH}
          value={otherText}
          onChange={(event) =>
            onChange(withMultiOther(question, answers, event.target.value))
          }
        />
      ) : null}
    </fieldset>
  );
}

function QuestionFlow({ plan }: { plan: Plan }) {
  const copy = questionsCopy;
  const router = useRouter();
  const hydrated = useHydrated();
  const { questions } = plan.questionAnswers;
  const [answers, setAnswers] = useState<Answers>(plan.questionAnswers.answers);
  const [index, setIndex] = useState(() =>
    resumeIndex(questions, plan.questionAnswers.answers),
  );
  const [openOther, setOpenOther] = useState<ReadonlySet<string>>(new Set());
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { status, schedule, flush } = useAutosave<Answers>((value) =>
    patchPlan(plan.id, { questionAnswers: { answers: value } }),
  );

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const canContinue = question ? hasAnswer(question, answers) : false;

  function setAnswer(value: AnswerValue) {
    if (!question) return;
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    schedule(next);
  }

  function setOtherOpen(open: boolean) {
    if (!question) return;
    setOpenOther((previous) => {
      const next = new Set(previous);
      if (open) next.add(question.id);
      else next.delete(question.id);
      return next;
    });
  }

  async function advance(skip: boolean) {
    if (!question || advancing) return;
    if (skip) {
      const next = { ...answers, [question.id]: skippedValue(question) };
      setAnswers(next);
      schedule(next);
    }
    if (!isLast) {
      setIndex(index + 1);
      return;
    }
    setAdvancing(true);
    setError(null);
    try {
      if (!(await flush())) throw new Error(copy.saveFailed);
      await patchPlan(plan.id, { step: Math.max(plan.step, ROADMAP_STEP) });
      router.push(`/plans/${plan.id}?step=${ROADMAP_STEP}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : plansCopy.errors.generic);
      setAdvancing(false);
    }
  }

  function back() {
    if (index > 0) setIndex(index - 1);
    else router.push(`/plans/${plan.id}?step=${TECH_STEP}`);
  }

  // Pintasan papan ketik: angka memilih opsi, Enter melanjutkan (doc 08 bagian 6).
  const latest = useRef({ question, answers, canContinue });
  latest.current = { question, answers, canContinue };
  const handlers = useRef({ setAnswer, advance });
  handlers.current = { setAnswer, advance };
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const {
        question: current,
        answers: currentAnswers,
        canContinue: can,
      } = latest.current;
      if (!current) return;
      if (event.key === "Enter" && can && !ownsEnterKey(event.target)) {
        event.preventDefault();
        void handlers.current.advance(false);
        return;
      }
      const digit = Number(event.key);
      if (
        isTypingTarget(event.target) ||
        current.type === "text" ||
        !Number.isInteger(digit)
      )
        return;
      const option = current.options[digit - 1];
      if (!option) return;
      event.preventDefault();
      const value = currentAnswers[current.id];
      handlers.current.setAnswer(
        current.type === "multi_choice" ? toggleOption(value, option) : option,
      );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!question) return null;

  const inputProps: AnswerInputProps = {
    question,
    answers,
    onChange: setAnswer,
    otherOpen: openOther.has(question.id),
    onOtherOpen: setOtherOpen,
  };

  return (
    <section aria-labelledby="question-title">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground tabular">
          {copy.progress(index + 1, questions.length)}
        </p>
        <SaveIndicator status={status} />
      </div>
      <div
        role="progressbar"
        aria-label={copy.progressLabel}
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-valuenow={index + 1}
        className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-200"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <h2
        id="question-title"
        className="mt-8 text-xl leading-snug font-semibold tracking-tight text-balance"
      >
        {question.question}
      </h2>

      <div className="mt-6" key={question.id}>
        {question.type === "text" ? (
          <Textarea
            aria-labelledby="question-title"
            className="min-h-36"
            placeholder={copy.textPlaceholder}
            value={
              typeof answers[question.id] === "string" ? String(answers[question.id]) : ""
            }
            onChange={(event) => setAnswer(event.target.value)}
            autoFocus
          />
        ) : question.type === "single_choice" ? (
          <SingleChoice {...inputProps} />
        ) : (
          <MultiChoice {...inputProps} />
        )}
      </div>

      {question.type !== "text" ? (
        <p className="mt-4 hidden text-xs text-muted-foreground md:block">
          {copy.keyboardHint}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-control bg-negative-soft px-3.5 py-2.5 text-sm text-negative"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={back} disabled={advancing}>
          {copy.back}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void advance(true)}
            disabled={advancing}
          >
            {copy.skip}
          </Button>
          <Button
            type="button"
            onClick={() => void advance(false)}
            disabled={!hydrated || !canContinue || advancing}
          >
            {isLast ? copy.finish : copy.next}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Langkah 3: pertanyaan klarifikasi. Membuatnya bila belum ada, lalu satu pertanyaan per layar. */
export function QuestionStep({ plan }: { plan: Plan }) {
  if (plan.questionAnswers.questions.length === 0)
    return <GenerateQuestions planId={plan.id} />;
  return <QuestionFlow plan={plan} />;
}
