import { CONTEXT_PAGE_CHARS } from "./limits";
import type { DocSlug } from "./schemas";

/** Halaman yang ikut ke konteks pipeline, urut dan berbatas (M7-19). */
export const CONTEXT_SLUGS = Object.keys(
  CONTEXT_PAGE_CHARS,
) as (keyof typeof CONTEXT_PAGE_CHARS & DocSlug)[];

/**
 * Blok konteks proyek eksisting untuk prompt plan: tiap halaman dipotong sampai batasnya, tag
 * pembungkus di dalam isi dinetralkan, nama proyek dibersihkan. Kosong bila tidak ada halaman.
 * Fungsi murni: dipakai service (`contextFor`) dan eval berkonteks.
 */
export function formatCodebaseContext(
  projectName: string,
  pages: readonly { slug: string; title: string; content: string }[],
): string {
  const sections = CONTEXT_SLUGS.flatMap((slug) => {
    const page = pages.find((p) => p.slug === slug);
    if (!page) return [];
    const limit = CONTEXT_PAGE_CHARS[slug];
    const text = page.content.trim();
    const body = text.length > limit ? `${text.slice(0, limit)}\n…(dipotong)` : text;
    return [
      `## ${page.title}\n${body.replace(/<\/?codebase_docs/gi, "<\\codebase_docs")}`,
    ];
  });
  if (sections.length === 0) return "";
  const name = projectName.replace(/[<>"&]/g, "_");
  return `<codebase_docs project="${name}">\n${sections.join("\n\n")}\n</codebase_docs>`;
}
