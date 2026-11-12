import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { plansCopy } from "../copy";
import { MAX_STEP, type Plan } from "../schemas";
import { planTitle } from "../title";
import { stepName } from "../wizard";

export const NEW_PLAN_HREF = "/plan?flow=new";
/** Alur proyek eksisting (fitur codebase); halaman /plan yang merender formnya. */
export const EXISTING_PLAN_HREF = "/plan?flow=existing";

/** Isi halaman /plan: pilih jenis proyek dan lanjutkan plan terakhir. Satu aksi utama. */
export function PlanLanding({ latest }: { latest?: Plan }) {
  const { landing, list } = plansCopy;
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
        {landing.title}
      </h1>
      <p className="mt-3 max-w-[52ch] text-base text-muted-foreground">
        {landing.subtitle}
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col rounded-card border border-border bg-card p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            {landing.newProject.title}
          </h2>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            {landing.newProject.body}
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href={NEW_PLAN_HREF}>{landing.newProject.action}</Link>
          </Button>
        </section>

        <section className="flex flex-col rounded-card border border-border bg-card p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            {landing.existingProject.title}
          </h2>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            {landing.existingProject.body}
          </p>
          <Button asChild variant="secondary" className="mt-6 w-full">
            <Link href={EXISTING_PLAN_HREF}>{landing.existingProject.action}</Link>
          </Button>
        </section>
      </div>

      <section className="mt-12" aria-labelledby="resume-title">
        <h2 id="resume-title" className="text-lg font-semibold tracking-tight">
          {landing.resume.title}
        </h2>
        {latest ? (
          <Link
            href={`/plans/${latest.id}?step=${latest.step}`}
            className="group mt-4 flex items-center gap-4 rounded-card border border-border bg-card p-5 transition-colors hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium">{planTitle(latest)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {list.stepLabel(latest.step, MAX_STEP, stepName(latest.step))}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
              {plansCopy.actions.resume}
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        ) : (
          <EmptyState
            className="mt-4"
            icon={FileText}
            title={landing.resume.emptyTitle}
            description={landing.resume.emptyBody}
          />
        )}
      </section>
    </div>
  );
}
