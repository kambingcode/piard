import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/features/auth/server";
import {
  AgentPanel,
  AnalysisPanel,
  CodebaseHeader,
  CodebaseInfo,
  codebaseCopy,
  type DocSlug,
  DocsViewer,
  docSlugSchema,
  SourcePanel,
} from "@/features/codebase";
import {
  getAgentService,
  getAnalysisService,
  getCodebaseService,
} from "@/features/codebase/server";
import { getUsageService } from "@/features/usage/server";

const copy = codebaseCopy.ui;

/** Origin yang sedang dibuka pengguna (untuk prompt agen bila `APP_URL` kosong). */
async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto =
    list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * `/codebases/:id[?page=<slug>]`: halaman proyek eksisting (M7-13, M7-14). Status dan sumber di atas
 * selama belum siap, dokumentasi di tengah, analisis ulang di bawahnya. Info di samping hanya di layar
 * sangat lebar (≥ 1536px); di bawahnya info turun ke bawah agar kolom dokumentasi tetap lapang.
 */
export default async function CodebasePage({
  params,
  searchParams,
}: PageProps<"/codebases/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const service = getCodebaseService();
  const found = service.find(user.id, id);
  if (!found) notFound();

  const analysis = getAnalysisService();
  const status = analysis.status(user.id, id);
  // Status bisa disamakan oleh `status()` (job yang berhenti), jadi codebase dibaca ulang.
  const codebase = service.get(user.id, id);
  const docs = service.listDocs(user.id, id);
  const requested = docSlugSchema.safeParse((await searchParams).page);
  const active: DocSlug = requested.success
    ? requested.data
    : (docs[0]?.slug ?? "ringkasan");
  const detail = docs.some((d) => d.slug === active)
    ? service.getDoc(user.id, id, active)
    : null;

  const { estimate, error: estimateError } =
    codebase.status === "source_ready"
      ? analysis.tryEstimate(user.id, id)
      : { estimate: null, error: null };
  const usage = status.job ? getUsageService().getRunUsage(user.id, status.job.id) : null;
  const maxUploadMb = Math.round(service.uploadLimit().bytes / (1024 * 1024));

  const agent = codebase.source === "agent" ? getAgentService() : null;
  const agentProps = agent
    ? {
        codebaseId: id,
        projectName: codebase.name,
        language: codebase.language,
        ...agent.baseUrl(await requestOrigin()),
        tokenExpiresAt: agent.tokenStatus(user.id, id).expiresAt,
      }
    : null;

  const awaiting = codebase.status === "awaiting_source";
  const showAnalysis = ["source_ready", "analyzing", "failed"].includes(codebase.status);
  const summary = codebase.analysisSummary;

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      {/* Konten yang di-scroll memudar di tepi atas layar, bukan terpotong tajam. Margin negatif menaruhnya
          di padding atas `main` (tidak menutupi tautan kembali) dan menjaga tinggi totalnya nol. */}
      <div
        aria-hidden
        className="pointer-events-none sticky top-12 z-20 -mt-8 h-8 bg-gradient-to-b from-background to-transparent md:top-0 md:-mt-12 md:mb-2 md:h-10"
      />
      <div className="space-y-8">
        <CodebaseHeader
          codebase={codebase}
          hasDocs={docs.length > 0}
          primaryAction={
            docs.length > 0 ? (
              <Button asChild>
                <Link href={`/plan?flow=new&codebase=${codebase.id}`}>
                  {copy.header.planFeature}
                </Link>
              </Button>
            ) : undefined
          }
        />

        <div className="grid gap-10 2xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-10">
            {awaiting || showAnalysis ? (
              <section
                aria-labelledby="codebase-status-title"
                className="rounded-card border border-border bg-card p-5 sm:p-6"
              >
                <h2 id="codebase-status-title" className="text-lg font-semibold">
                  {awaiting && agentProps ? copy.status.agentWaiting : copy.status.title}
                </h2>
                {awaiting && agentProps ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {copy.status.agentWaitingBody}
                  </p>
                ) : null}
                {awaiting && codebase.error ? (
                  // Mis. "Analisis dibatalkan…": tanpa ini pengguna tidak tahu kenapa diminta sumber lagi.
                  <output className="mt-1 block text-sm text-muted-foreground">
                    {codebase.error}
                  </output>
                ) : null}
                <div className="mt-5">
                  {awaiting ? (
                    agentProps ? (
                      <AgentPanel {...agentProps} waiting={docs.length === 0} />
                    ) : (
                      <SourcePanel codebase={codebase} maxUploadMb={maxUploadMb} />
                    )
                  ) : (
                    <AnalysisPanel
                      codebaseId={id}
                      initial={status}
                      estimate={estimate}
                      estimateError={estimateError}
                    />
                  )}
                </div>
              </section>
            ) : null}

            {summary && codebase.status === "ready" ? (
              <section
                aria-labelledby="codebase-summary-title"
                className="rounded-card bg-muted px-5 py-4 text-sm"
              >
                <h2 id="codebase-summary-title" className="font-medium">
                  {copy.status.summaryTitle}
                </h2>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {(["added", "changed", "unchanged", "proposed"] as const)
                    .filter((kind) => summary[kind].length > 0)
                    .map((kind) => (
                      <li key={kind}>
                        {copy.status.summary[kind](summary[kind].length)}
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}

            {docs.length > 0 || codebase.status === "ready" ? (
              <DocsViewer
                codebaseId={id}
                projectName={codebase.name}
                language={codebase.language}
                docs={docs}
                active={active}
                detail={detail}
                busy={codebase.status === "analyzing"}
              />
            ) : null}

            {codebase.status === "ready" ? (
              <details className="group rounded-card border border-border bg-card">
                <summary className="flex min-h-12 cursor-pointer items-center px-5 text-base font-semibold">
                  {copy.header.reanalyze}
                </summary>
                <div className="space-y-4 border-t border-border p-5 sm:p-6">
                  <p className="text-sm text-muted-foreground">
                    {copy.status.reanalyzeBody}
                  </p>
                  {agentProps ? (
                    <AgentPanel {...agentProps} waiting={false} />
                  ) : (
                    <SourcePanel codebase={codebase} maxUploadMb={maxUploadMb} />
                  )}
                </div>
              </details>
            ) : null}
          </div>

          <CodebaseInfo codebase={codebase} docs={docs} usage={usage} />
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/codebases/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const codebase = getCodebaseService().find(user.id, (await params).id);
  return { title: codebase ? codebase.name : copy.list.title };
}
