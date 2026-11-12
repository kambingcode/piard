import "server-only";

import { type AnalysisSummary, DOC_SLUGS, type DocSlug, docTitle } from "../schemas";
import type { CodebaseRepo, CodebaseRow } from "./repo";

export type PageOutcome = "added" | "changed" | "unchanged" | "proposed";

/**
 * Menulis satu halaman hasil analisis (AI) atau kiriman agen. Edit manual tidak pernah ditimpa (M7-16):
 * bila versi terbaru halaman itu `manual`, hasil baru disimpan sebagai **usulan** sampai pengguna
 * menerimanya. Isi yang sama dengan versi terbaru tidak menambah versi.
 */
export function writeGeneratedPage(
  repo: CodebaseRepo,
  row: CodebaseRow,
  slug: DocSlug,
  content: string,
  origin: "ai" | "agent",
): PageOutcome {
  const latest = repo.findDoc(row.id, slug);
  if (latest?.origin === "manual") {
    if (latest.content === content) {
      repo.deleteProposal(row.id, slug);
      return "unchanged";
    }
    repo.upsertProposal({
      codebaseId: row.id,
      slug,
      content,
      origin,
      baseVersion: latest.version,
    });
    return "proposed";
  }
  // Usulan lama tidak relevan lagi: halaman ini sekarang mengikuti hasil terbaru.
  repo.deleteProposal(row.id, slug);
  if (latest?.content === content) return "unchanged";
  repo.addDocVersions(row.id, [
    { slug, title: docTitle(slug, row.language), content, origin },
  ]);
  return latest ? "changed" : "added";
}

/** Ringkasan perubahan dari hasil per halaman, dalam urutan halaman standar. */
export function summarizeOutcomes(
  outcomes: Partial<Record<string, PageOutcome>>,
  origin: "ai" | "agent",
  at: Date,
): AnalysisSummary {
  const pick = (kind: PageOutcome) => DOC_SLUGS.filter((slug) => outcomes[slug] === kind);
  return {
    at: at.toISOString(),
    origin,
    added: pick("added"),
    changed: pick("changed"),
    unchanged: pick("unchanged"),
    proposed: pick("proposed"),
  };
}
