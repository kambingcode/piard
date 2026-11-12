/**
 * Pemecah hasil agen yang ditempel (jalur cadangan M7-08): satu Markdown dengan penanda
 * `<!-- piard:page <slug> -->` sebelum tiap halaman. Fungsi murni, dipakai server (sebelum menyimpan) dan
 * klien (pratinjau). Kesalahan format yang umum diperbaiki; yang meragukan ditolak dengan pesan jelas.
 */
import { DOC_CONTENT_MAX_LENGTH, DOC_PAGES, DOC_SLUGS, type DocSlug } from "./schemas";

/** Penanda longgar: spasi/huruf besar bebas, `piard:page` atau `piard page`, slug dengan/tanpa kutip. */
const MARKER =
  /^[ \t]*<!--\s*piard[:\s]\s*page\s*[:=]?\s*["']?([A-Za-z0-9_-]+)["']?\s*-->[ \t]*$/gim;
/** Pembungkus satu blok kode di seluruh teks (agen sering membungkus hasil dalam ```markdown). */
const FENCED = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1\s*$/;

export type ImportedPage = { slug: DocSlug; content: string };

export type ImportProblem =
  | { kind: "no_markers" }
  | { kind: "unknown_slug"; slug: string }
  | { kind: "duplicate_slug"; slug: DocSlug }
  | { kind: "too_long"; slug: DocSlug };

export type ImportResult =
  | {
      ok: true;
      pages: ImportedPage[];
      /** Perbaikan yang dilakukan (untuk ditampilkan): pembungkus dilepas, teks pembuka dibuang, … */
      fixes: ImportFix[];
    }
  | { ok: false; problems: ImportProblem[] };

export type ImportFix =
  | "unwrapped_fence"
  | "dropped_preamble"
  | "dropped_empty"
  | "normalized_slug"
  | "dropped_title";

const isSlug = (value: string): value is DocSlug =>
  (DOC_SLUGS as readonly string[]).includes(value);

/** Judul halaman (id/en) yang sering ditulis agen di baris pertama walau diminta tidak. */
const TITLES = new Map(
  DOC_PAGES.flatMap((p) => [
    [p.title.id.toLowerCase(), p.slug],
    [p.title.en.toLowerCase(), p.slug],
  ]),
);

/**
 * Memecah teks tempelan menjadi halaman standar.
 *
 * Diperbaiki: pembungkus code fence di seluruh teks, teks pembuka sebelum penanda pertama, slug huruf
 * besar/kutip/garis bawah (`alur_utama`), judul `#` di baris pertama yang sama dengan judul halaman, dan
 * halaman kosong. Ditolak: tidak ada penanda, slug tak dikenal, slug ganda, halaman terlalu panjang.
 */
export function splitPiardMarkdown(input: string): ImportResult {
  const fixes = new Set<ImportFix>();
  let text = input.replace(/\r\n?/g, "\n");
  const fenced = FENCED.exec(text);
  if (fenced?.[2] !== undefined && new RegExp(MARKER.source, "im").test(fenced[2])) {
    text = fenced[2];
    fixes.add("unwrapped_fence");
  }

  const markers = [...text.matchAll(MARKER)];
  if (markers.length === 0) return { ok: false, problems: [{ kind: "no_markers" }] };

  const first = markers[0];
  const preamble = first ? text.slice(0, first.index) : "";
  if (preamble.trim() !== "") fixes.add("dropped_preamble");
  // Fence dibuka di teks pembuka ("Berikut hasilnya:\n```markdown"): penutupnya di akhir teks dibuang
  // agar tidak masuk ke halaman terakhir. Hanya bila jumlah baris fence sesudahnya ganjil (ada satu yang
  // tidak berpasangan), supaya penutup blok ```mermaid di akhir halaman tidak ikut terbuang.
  const opened = /(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n`]*\s*$/.exec(preamble)?.[1];
  const fenceLines = text.slice(first?.index ?? 0).match(/^[ \t]*(`{3,}|~{3,})/gm) ?? [];
  if (opened && fenceLines.length % 2 === 1) {
    const closing = new RegExp(`\\n[ \\t]*${opened}[ \\t]*\\s*$`);
    if (closing.test(text)) {
      text = text.replace(closing, "\n");
      fixes.add("unwrapped_fence");
    }
  }

  const problems: ImportProblem[] = [];
  const seen = new Set<DocSlug>();
  const pages: ImportedPage[] = [];
  markers.forEach((marker, i) => {
    const raw = marker[1] ?? "";
    const normalized = raw.toLowerCase().replace(/_/g, "-");
    if (normalized !== raw) fixes.add("normalized_slug");
    if (!isSlug(normalized)) {
      problems.push({ kind: "unknown_slug", slug: raw });
      return;
    }
    if (seen.has(normalized)) {
      problems.push({ kind: "duplicate_slug", slug: normalized });
      return;
    }
    seen.add(normalized);

    const start = (marker.index ?? 0) + marker[0].length;
    const end = markers[i + 1]?.index ?? text.length;
    let content = text.slice(start, end).trim();
    const heading = /^#{1,2}\s+(.+)\n?/.exec(content);
    if (heading?.[1] && TITLES.get(heading[1].trim().toLowerCase()) === normalized) {
      content = content.slice(heading[0].length).trim();
      fixes.add("dropped_title");
    }
    if (content === "") {
      fixes.add("dropped_empty");
      return;
    }
    if (content.length > DOC_CONTENT_MAX_LENGTH) {
      problems.push({ kind: "too_long", slug: normalized });
      return;
    }
    pages.push({ slug: normalized, content });
  });

  if (problems.length > 0) return { ok: false, problems };
  if (pages.length === 0) return { ok: false, problems: [{ kind: "no_markers" }] };
  return { ok: true, pages, fixes: [...fixes] };
}
