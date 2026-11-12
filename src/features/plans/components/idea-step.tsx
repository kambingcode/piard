import Link from "next/link";
import { Button } from "@/components/ui/button";
import { plansCopy } from "../copy";
import type { Plan } from "../schemas";

/** Langkah 1: ide yang sudah disimpan (hanya baca; ide tidak diubah setelah plan dibuat). */
export function IdeaStep({ plan }: { plan: Plan }) {
  const copy = plansCopy.wizard.idea;
  return (
    <section aria-labelledby="idea-step-title">
      <h2 id="idea-step-title" className="text-xl font-semibold tracking-tight">
        {copy.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
      <blockquote className="mt-5 rounded-card border border-border bg-card p-5 text-base whitespace-pre-wrap">
        {plan.idea}
      </blockquote>
      <p className="mt-3 text-sm text-muted-foreground">
        {copy.languageLabel}: {plansCopy.ideaForm.languages[plan.language]}
      </p>
      <div className="mt-8 flex justify-end">
        <Button asChild>
          <Link href={`/plans/${plan.id}?step=2`}>{plansCopy.wizard.next}</Link>
        </Button>
      </div>
    </section>
  );
}
