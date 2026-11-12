import { redactSecrets } from "@/features/codebase/scan/redact";
import { skipReasonForPath } from "@/features/codebase/scan/rules";
import { DOC_SLUGS, type DocSlug } from "@/features/codebase/schemas";
import { mermaidBlocks } from "@/features/prd/structure";
import { parseMermaid } from "./mermaid-node";
import type { Check } from "./roadmap-checks";

/** Selisih token masukan perkiraan vs aktual yang masih diterima (M7-12). */
export const ESTIMATE_TOLERANCE = 0.35;

/** Ekstensi berkas yang dikenali; `users.email` atau `process.env` bukan jalur berkas. */
const FILE_EXTENSIONS = new Set(
  (
    "ts tsx js jsx mjs cjs json jsonc md mdx yml yaml toml ini cfg conf sql py go rs rb php java kt " +
    "swift cs css scss sass less html htm sh bash zsh lock txt prisma graphql gql vue svelte astro xml " +
    "csv example template dockerfile mod sum gradle properties"
  ).split(" "),
);

/** Batas jalur asing yang masih diterima: teks seperti "periksa `.nvmrc` jika ada" tidak bisa dibedakan. */
export const UNKNOWN_PATH_SHARE = 0.02;

/**
 * Teks dalam backtick yang tampak seperti jalur berkas/folder repo (ada `/`, ekstensi berkas yang dikenal,
 * atau berkas titik), bukan rute API (`/api/...`), URL, host, glob, perintah, identifier, atau placeholder.
 * Alias `@/` dibaca sebagai `src/`.
 */
export function mentionedPaths(content: string): string[] {
  const found = new Set<string>();
  // Blok kode (pohon folder, contoh kode, mermaid) tidak dihitung: isinya bukan rujukan satu jalur.
  const prose = content.replace(/```[\s\S]*?```/g, "");
  for (const [, raw] of prose.matchAll(/`([^`\n]+)`/g)) {
    let token = (raw ?? "")
      .trim()
      .replace(/[:#]\d+(-\d+)?$/, "")
      .replace(/\/$/, "");
    if (token === "" || /\s/.test(token) || token.includes("...") || token.includes("…"))
      continue;
    if (/^(\/|~|\$|https?:)/.test(token)) continue;
    if (/[*<>{}()=,;'"|[\]]/.test(token) && !/\[[A-Za-z]+\]/.test(token)) continue;
    token = token.replace(/^@\//, "src/").replace(/^\.\//, "");
    const base = token.slice(token.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
    const dotfile = base.startsWith(".") && base.length > 1;
    if (token.includes("/") || dotfile || FILE_EXTENSIONS.has(ext)) found.add(token);
  }
  return [...found];
}

/**
 * Jalur yang disebut tetapi tidak ada: bukan berkas, bukan folder (prefiks), bukan nama dasar berkas yang
 * ada, bukan berkas tanpa ekstensi (`json-types` → `json-types.ts`), bukan folder yang memang dilewati
 * pemindai, dan tidak ditemukan oleh `exists` (mis. berkas di luar repo yang benar ada di disk).
 */
export function unknownPaths(
  content: string,
  manifestPaths: readonly string[],
  exists: (path: string) => boolean = () => false,
): string[] {
  const files = new Set(manifestPaths);
  const dirs = new Set<string>();
  const bases = new Set<string>();
  for (const path of manifestPaths) {
    const parts = path.split("/");
    bases.add(parts[parts.length - 1] ?? path);
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join("/"));
  }
  const known = (p: string) =>
    files.has(p) ||
    dirs.has(p) ||
    bases.has(p) ||
    manifestPaths.some(
      (f) =>
        f.endsWith(`/${p}`) ||
        f.startsWith(`${p}.`) ||
        f.startsWith(`${p}-`) ||
        f.includes(`/${p}.`) ||
        f.includes(`/${p}/`),
    ) ||
    // Folder/berkas yang memang dilewati pemindai (dependensi, build, lockfile) boleh disebut.
    skipReasonForPath(`${p}/x`) !== null ||
    skipReasonForPath(p) !== null ||
    exists(p);
  return mentionedPaths(content).filter((p) => !known(p));
}

export type CodebaseEvalInput = {
  pages: Partial<Record<DocSlug, string>>;
  manifestPaths: readonly string[];
  /** Cek keberadaan di disk untuk jalur di luar manifes (mis. dokumen di folder induk repo). */
  exists?: (path: string) => boolean;
  estimateInput: number;
  actualInput: number;
};

/** Pemeriksaan hasil analisis satu repo. Fungsi murni kecuali parse mermaid (asinkron). */
export async function checkCodebaseDocs(input: CodebaseEvalInput): Promise<Check[]> {
  const missing = DOC_SLUGS.filter((slug) => !input.pages[slug]?.trim());
  const architecture = input.pages.arsitektur ?? "";
  const blocks = mermaidBlocks(architecture);
  const invalid: string[] = [];
  for (const [i, block] of blocks.entries()) {
    try {
      await parseMermaid(block);
    } catch (error) {
      invalid.push(`diagram ${i + 1}: ${String(error).split("\n")[0]?.slice(0, 120)}`);
    }
  }
  const unknown = DOC_SLUGS.flatMap((slug) =>
    unknownPaths(input.pages[slug] ?? "", input.manifestPaths, input.exists).map(
      (p) => `${slug}: ${p}`,
    ),
  );
  const mentioned = DOC_SLUGS.reduce(
    (sum, slug) => sum + mentionedPaths(input.pages[slug] ?? "").length,
    0,
  );
  const unknownLimit = Math.max(1, Math.floor(mentioned * UNKNOWN_PATH_SHARE));
  const all = DOC_SLUGS.map((slug) => input.pages[slug] ?? "").join("\n\n");
  const secrets = redactSecrets("docs/output.md", all).count;
  const drift =
    input.actualInput > 0
      ? Math.abs(input.estimateInput - input.actualInput) / input.actualInput
      : 1;
  return [
    {
      name: "semua halaman standar ada",
      pass: missing.length === 0,
      detail:
        missing.length === 0
          ? `${DOC_SLUGS.length} halaman`
          : `kurang: ${missing.join(", ")}`,
    },
    {
      name: "arsitektur memuat mermaid yang valid (mermaid.parse)",
      pass: blocks.length > 0 && invalid.length === 0,
      detail:
        blocks.length === 0
          ? "tidak ada diagram"
          : invalid.join("; ") || `${blocks.length} diagram`,
    },
    {
      name: `tanpa jalur karangan (≤ ${UNKNOWN_PATH_SHARE * 100}% jalur tidak ditemukan)`,
      pass: unknown.length <= unknownLimit,
      detail: `${unknown.length} dari ${mentioned} jalur tidak ditemukan${
        unknown.length > 0 ? `: ${unknown.slice(0, 15).join(", ")}` : ""
      }`,
    },
    {
      name: "tanpa rahasia di keluaran",
      pass: secrets === 0,
      detail: `${secrets} pola rahasia`,
    },
    {
      name: `perkiraan token masukan dalam ±${ESTIMATE_TOLERANCE * 100}%`,
      pass: drift <= ESTIMATE_TOLERANCE,
      detail: `perkiraan ${input.estimateInput}, aktual ${input.actualInput} (${(drift * 100).toFixed(0)}%)`,
    },
  ];
}
