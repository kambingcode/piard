import "server-only";

import { strToU8, zipSync } from "fflate";
import { slugify } from "@/lib/slug";
import { AppError } from "@/server/http/errors";
import { CONTEXT_SLUGS, formatCodebaseContext } from "../context";
import { codebaseCopy } from "../copy";
import { docFile } from "../doc-file";
import { githubDisplayUrl, parseGithubUrl } from "../github-url";
import { type ScanResult, scanRepo } from "../scan/scan-repo";
import { ArchiveError, extractZip } from "../scan/unzip";
import {
  type AnalysisSummary,
  type Codebase,
  type CreateCodebaseInput,
  DOC_PAGES,
  type DocPage,
  type DocProposal,
  type DocSlug,
  type DocSummary,
  type DocVersion,
  docOrder,
  docTitle,
  type GithubSourceInput,
  type PatchCodebaseInput,
} from "../schemas";
import { downloadGithubRepo, type GithubFetch } from "./github";
import type { CodebaseDocRow, CodebaseRepo, CodebaseRow } from "./repo";
import type { SourceStore } from "./source-store";

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

export function toCodebase(row: CodebaseRow): Codebase {
  // Daftar berkas lengkap tidak dikirim ke klien (bisa ribuan baris); cukup ringkasannya.
  const manifest = row.manifest
    ? (({ files: _files, ...rest }) => rest)(row.manifest)
    : null;
  return {
    id: row.id,
    name: row.name,
    language: row.language,
    source: row.source,
    sourceRef: row.sourceRef,
    status: row.status,
    error: row.error,
    detectedStack: row.detectedStack,
    manifest,
    sourceReceivedAt: iso(row.sourceReceivedAt),
    analyzedAt: iso(row.analyzedAt),
    // Slug di ringkasan hanya slug standar (ditulis `summarizeOutcomes` dari DOC_SLUGS).
    analysisSummary: (row.analysisSummary as AnalysisSummary | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(
  row: CodebaseDocRow,
  flags: { edited: boolean; hasProposal: boolean },
): DocSummary {
  return {
    // Hanya slug standar yang pernah ditulis (divalidasi skema di setiap jalur masuk).
    slug: row.slug as DocSlug,
    title: row.title,
    version: row.version,
    origin: row.origin,
    createdAt: row.createdAt.toISOString(),
    ...flags,
  };
}

const notFound = () => new AppError("NOT_FOUND", codebaseCopy.errors.notFound);

const FILE_NAME_MAX_LENGTH = 120;
const DEFAULT_FILE_NAME = "proyek.zip";

/**
 * Nama berkas dari header `x-file-name` (di-encode klien agar aman untuk header): hanya nama dasar,
 * tanpa karakter kontrol, dipendekkan. Hanya untuk ditampilkan, tidak pernah dipakai sebagai jalur.
 */
export function sanitizeFileName(raw: string | null): string {
  if (!raw) return DEFAULT_FILE_NAME;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Bukan URI yang valid: pakai apa adanya.
  }
  const base = decoded.slice(
    Math.max(decoded.lastIndexOf("/"), decoded.lastIndexOf("\\")) + 1,
  );
  // biome-ignore lint/suspicious/noControlCharactersInRegex: karakter kontrol memang yang dibuang.
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return clean.slice(0, FILE_NAME_MAX_LENGTH) || DEFAULT_FILE_NAME;
}

function archiveMessage(error: ArchiveError): string {
  const zip = codebaseCopy.zip;
  switch (error.problem) {
    case "empty":
      return zip.archiveEmpty;
    case "unsafe_path":
      return zip.unsafe_path(error.detail ?? "jalur tidak dikenal");
    default:
      return zip[error.problem];
  }
}

export type CodebaseServiceDeps = {
  /** Penyimpanan sumber sementara (teks tersaring), dibaca job analisis. */
  store: SourceStore;
  /** Batas upload ZIP dalam byte (`CODEBASE_MAX_UPLOAD_MB`); juga batas unduhan GitHub. */
  maxUploadBytes: number;
  /** Menghentikan job analisis yang sedang berjalan saat proyeknya dihapus (job runner). */
  cancelJob?: (jobId: string) => void;
  /** `fetch` untuk unduhan GitHub; tes memakai tiruan (tanpa jaringan nyata). */
  fetch?: GithubFetch;
  now?: () => Date;
};

/**
 * Aturan bisnis proyek eksisting: kepemilikan, nama, pembacaan dokumentasi, dan penerimaan sumber.
 * Analisis (M7-10) dan jalur agen (M7-07) dibangun di atas service ini.
 */
export function createCodebaseService(repo: CodebaseRepo, deps: CodebaseServiceDeps) {
  const now = deps.now ?? (() => new Date());

  /** Codebase milik pengguna, atau 404. */
  function own(userId: string, id: string): CodebaseRow {
    const row = repo.find(userId, id);
    if (!row) throw notFound();
    return row;
  }

  /**
   * Menyimpan hasil pindai sebagai sumber baru: teks tersaring ke penyimpanan sementara, manifes dan
   * teknologi ke database, status `source_ready` (menunggu konfirmasi biaya lalu analisis, M7-10/M7-12).
   * Dipakai jalur ZIP dan GitHub.
   */
  function acceptScan(
    userId: string,
    row: CodebaseRow,
    scan: ScanResult,
    sourceRef: string,
  ) {
    if (scan.files.length === 0)
      throw new AppError("VALIDATION", codebaseCopy.zip.noCode);
    deps.store.save(row.id, scan.files, now().getTime());
    repo.update(userId, row.id, {
      status: "source_ready",
      error: null,
      sourceRef,
      manifest: scan.manifest,
      detectedStack: scan.detectedStack,
      sourceReceivedAt: now(),
    });
    return toCodebase(own(userId, row.id));
  }

  /** Mengurai arsip; galat arsip menjadi `VALIDATION` dengan pesan pengguna. */
  function extract(bytes: Uint8Array, include?: (path: string) => boolean) {
    try {
      return extractZip(bytes, { include });
    } catch (error) {
      if (error instanceof ArchiveError) {
        throw new AppError("VALIDATION", archiveMessage(error), 400, error);
      }
      throw error;
    }
  }

  /** Sumber baru hanya boleh masuk bila sumber proyek cocok dan analisis tidak sedang berjalan. */
  function assertAccepts(row: CodebaseRow, source: "zip" | "github") {
    if (row.source !== source) {
      const label = codebaseCopy.source[row.source];
      throw new AppError(
        "VALIDATION",
        source === "zip"
          ? codebaseCopy.errors.wrongSource(label)
          : codebaseCopy.errors.wrongSourceGithub(label),
      );
    }
    if (row.status === "analyzing")
      throw new AppError("CONFLICT", codebaseCopy.errors.busy);
  }

  /** Codebase milik pengguna yang dokumentasinya boleh diubah sekarang (tidak sedang dianalisis). */
  function editable(userId: string, id: string): CodebaseRow {
    const row = own(userId, id);
    if (row.status === "analyzing")
      throw new AppError("CONFLICT", codebaseCopy.errors.busyDocs);
    return row;
  }

  const api = {
    own,

    /** Batas upload ZIP dalam byte, untuk dibaca route sebelum badan permintaan dibaca. */
    uploadLimit(): { bytes: number; messages: { tooLarge: string; empty: string } } {
      const mb = Math.round(deps.maxUploadBytes / (1024 * 1024));
      return {
        bytes: deps.maxUploadBytes,
        messages: {
          tooLarge: codebaseCopy.zip.tooLarge(mb),
          empty: codebaseCopy.zip.empty,
        },
      };
    },

    /**
     * Menerima ZIP untuk codebase bersumber ZIP. Arsip diurai di memori, disaring, dan disensor; hanya
     * teks tersaring yang disimpan sementara. Sumber lama (bila ada) diganti; dokumentasi tidak disentuh.
     *
     * @throws {AppError} `VALIDATION` bila arsip ditolak atau tidak berisi kode, `CONFLICT` saat analisis.
     */
    receiveZip(
      userId: string,
      id: string,
      bytes: Uint8Array,
      fileName: string | null,
    ): Codebase {
      const row = own(userId, id);
      assertAccepts(row, "zip");
      const extracted = extract(bytes);
      return acceptScan(
        userId,
        row,
        scanRepo(extracted.entries, extracted.skipped),
        sanitizeFileName(fileName),
      );
    },

    /**
     * Mengunduh repo GitHub (publik, atau privat dengan token sekali pakai) lalu memprosesnya seperti
     * ZIP. Hanya `api.github.com`/`codeload.github.com` yang dihubungi (ADR 0016). Bila URL menyebut
     * subfolder, hanya berkas di dalamnya yang diurai dan jalurnya relatif terhadap subfolder itu.
     *
     * @throws {AppError} `VALIDATION` untuk URL/repo/arsip yang ditolak, `CONFLICT` saat analisis.
     */
    async receiveGithub(
      userId: string,
      id: string,
      input: GithubSourceInput,
    ): Promise<Codebase> {
      assertAccepts(own(userId, id), "github");
      const parsed = parseGithubUrl(input.url);
      if (!parsed.ok) {
        throw new AppError("VALIDATION", codebaseCopy.github.url[parsed.problem]);
      }
      const { owner, repo } = parsed.value;
      const download = await downloadGithubRepo(parsed.value, {
        fetch: deps.fetch ?? fetch,
        maxBytes: deps.maxUploadBytes,
        token: input.token,
      });

      // Arsip GitHub selalu berpembungkus `<pemilik>-<repo>-<sha>/`; dilepas di sini bersama subfolder.
      const prefixOf = (path: string): string | null => {
        const slash = path.indexOf("/");
        if (slash === -1) return null;
        const prefix = path.slice(0, slash + 1);
        if (!download.subfolder) return prefix;
        const sub = `${prefix}${download.subfolder}/`;
        return path.startsWith(sub) ? sub : null;
      };
      let matched = 0;
      const extracted = extract(download.bytes, (path) => {
        const ok = prefixOf(path) !== null;
        if (ok) matched += 1;
        return ok;
      });
      if (download.subfolder && matched === 0) {
        throw new AppError(
          "VALIDATION",
          codebaseCopy.github.folderNotFound(download.subfolder),
        );
      }
      const entries = extracted.entries.map((entry) => ({
        path: entry.path.slice(prefixOf(entry.path)?.length ?? 0),
        bytes: entry.bytes,
      }));

      // Unduhan bisa lama: status dibaca ulang agar sumber tidak masuk ke analisis yang baru dimulai.
      const fresh = own(userId, id);
      assertAccepts(fresh, "github");
      return acceptScan(
        userId,
        fresh,
        scanRepo(entries, extracted.skipped, { unwrap: false }),
        githubDisplayUrl(
          owner,
          repo,
          parsed.value.tree.length > 0 ? download.ref : null,
          download.subfolder,
        ),
      );
    },

    /** Menghapus sumber sementara yang kedaluwarsa (dipanggil saat boot). */
    sweepSources(): number {
      return deps.store.sweep(now().getTime());
    },

    create(userId: string, input: CreateCodebaseInput): Codebase {
      const workspace = repo.defaultWorkspace(userId);
      return toCodebase(
        repo.insert({
          userId,
          workspaceId: workspace.id,
          name: input.name,
          source: input.source,
          language: input.language,
        }),
      );
    },

    list(userId: string): Codebase[] {
      return repo.list(userId).map(toCodebase);
    },

    /** Daftar proyek beserta jumlah halaman dokumentasinya (halaman /codebases dan sidebar). */
    listWithPages(userId: string): (Codebase & { pages: number })[] {
      const counts = repo.docCounts(userId);
      return repo
        .list(userId)
        .map((row) => ({ ...toCodebase(row), pages: counts.get(row.id) ?? 0 }));
    },

    /**
     * Konteks proyek eksisting untuk prompt plan fitur baru (M7-19): versi terbaru halaman ringkasan,
     * teknologi, modul, dan data dalam anggaran tetap, dibungkus `<codebase_docs>` sebagai data. Kosong
     * bila plan tanpa proyek atau proyeknya sudah dihapus/bukan milik pengguna (prompt tidak berubah).
     */
    contextFor(userId: string, codebaseId: string | null): string {
      if (!codebaseId) return "";
      const row = repo.find(userId, codebaseId);
      if (!row) return "";
      return formatCodebaseContext(
        row.name,
        CONTEXT_SLUGS.flatMap((slug) => {
          const doc = repo.findDoc(row.id, slug);
          return doc ? [{ slug, title: doc.title, content: doc.content }] : [];
        }),
      );
    },

    /** Untuk halaman: codebase milik pengguna, atau undefined (halaman memanggil `notFound()`). */
    find(userId: string, id: string): Codebase | undefined {
      const row = repo.find(userId, id);
      return row ? toCodebase(row) : undefined;
    },

    get(userId: string, id: string): Codebase {
      return toCodebase(own(userId, id));
    },

    rename(userId: string, id: string, input: PatchCodebaseInput): Codebase {
      if (!repo.update(userId, id, { name: input.name })) throw notFound();
      return toCodebase(own(userId, id));
    },

    /**
     * Menghapus proyek: dokumentasi, usulan, dan token ikut terhapus (cascade), sumber sementara dihapus,
     * job analisis yang berjalan dihentikan. Plan yang tertaut tetap ada (`codebase_id` menjadi null);
     * jumlahnya dikembalikan agar UI bisa memberi tahu pengguna.
     */
    delete(userId: string, id: string): { keptPlans: number } {
      const row = own(userId, id);
      if (row.status === "analyzing" && row.analysisJobId)
        deps.cancelJob?.(row.analysisJobId);
      const result = repo.delete(userId, id);
      if (!result) throw notFound();
      deps.store.remove(id);
      return result;
    },

    /** Versi terbaru tiap halaman, dalam urutan halaman standar. */
    listDocs(userId: string, id: string): DocSummary[] {
      own(userId, id);
      const edited = new Set(repo.manuallyEditedSlugs(id));
      const proposals = new Set(repo.listProposals(id).map((p) => p.slug));
      return repo
        .latestDocs(id)
        .sort((a, b) => docOrder(a.slug) - docOrder(b.slug))
        .map((row) =>
          toSummary(row, {
            edited: edited.has(row.slug),
            hasProposal: proposals.has(row.slug),
          }),
        );
    },

    /** Satu halaman (terbaru atau versi tertentu) beserta riwayat versinya dan usulan yang menunggu. */
    getDoc(
      userId: string,
      id: string,
      slug: DocSlug,
      version?: number,
    ): { page: DocPage; versions: DocVersion[]; proposal: DocProposal | null } {
      own(userId, id);
      const row = repo.findDoc(id, slug, version);
      if (!row) {
        const message =
          version === undefined
            ? codebaseCopy.errors.docNotFound
            : codebaseCopy.errors.docVersionNotFound;
        throw new AppError("NOT_FOUND", message);
      }
      const proposal = repo.findProposal(id, slug);
      return {
        page: {
          ...toSummary(row, {
            edited: repo.manuallyEditedSlugs(id).includes(slug),
            hasProposal: Boolean(proposal),
          }),
          content: row.content,
        },
        versions: repo.docVersions(id, slug).map((v) => ({
          version: v.version,
          origin: v.origin,
          createdAt: v.createdAt.toISOString(),
        })),
        proposal: proposal
          ? {
              content: proposal.content,
              origin: proposal.origin,
              baseVersion: proposal.baseVersion,
              createdAt: proposal.createdAt.toISOString(),
            }
          : null,
      };
    },

    /**
     * Edit manual satu halaman → versi baru `origin = manual` (M7-15). Isi yang sama dengan versi terbaru
     * tidak menambah versi.
     *
     * @throws {AppError} `CONFLICT` selama analisis berjalan (hasilnya bisa menimpa urutan versi).
     */
    saveDoc(userId: string, id: string, slug: DocSlug, content: string) {
      const row = editable(userId, id);
      repo.addDocVersions(id, [
        { slug, title: docTitle(slug, row.language), content, origin: "manual" },
      ]);
      return api.getDoc(userId, id, slug);
    },

    /** Memulihkan versi lama dengan menyalinnya menjadi versi terbaru (`origin = manual`). */
    restoreDoc(userId: string, id: string, slug: DocSlug, version: number) {
      const row = editable(userId, id);
      const old = repo.findDoc(id, slug, version);
      if (!old) throw new AppError("NOT_FOUND", codebaseCopy.errors.docVersionNotFound);
      repo.addDocVersions(id, [
        {
          slug,
          title: docTitle(slug, row.language),
          content: old.content,
          origin: "manual",
        },
      ]);
      return api.getDoc(userId, id, slug);
    },

    /**
     * Menerima usulan (menjadi versi baru dengan asal usulan itu) atau menolaknya (usulan dibuang, edit
     * manual tetap terbaru).
     */
    resolveProposal(
      userId: string,
      id: string,
      slug: DocSlug,
      action: "accept" | "reject",
    ) {
      const row = editable(userId, id);
      const proposal = repo.findProposal(id, slug);
      if (!proposal)
        throw new AppError("NOT_FOUND", codebaseCopy.errors.proposalNotFound);
      if (action === "accept") {
        repo.addDocVersions(id, [
          {
            slug,
            title: docTitle(slug, row.language),
            content: proposal.content,
            origin: proposal.origin,
          },
        ]);
      }
      repo.deleteProposal(id, slug);
      return api.getDoc(userId, id, slug);
    },

    /**
     * Berkas Markdown dokumentasi (`NN-<slug>.md`, versi terbaru tiap halaman yang ada), untuk ZIP
     * dokumentasi dan folder `codebase/` di ZIP plan berkonteks (M7-20). Kosong bila belum ada halaman
     * atau proyek bukan milik pengguna.
     */
    docFiles(userId: string, id: string): Record<string, string> {
      if (!repo.find(userId, id)) return {};
      const latest = new Map(repo.latestDocs(id).map((doc) => [doc.slug, doc]));
      const files: Record<string, string> = {};
      DOC_PAGES.forEach((page, index) => {
        const doc = latest.get(page.slug);
        if (!doc) return;
        const prefix = String(index + 1).padStart(2, "0");
        files[`${prefix}-${page.slug}.md`] = docFile(doc.title, doc.content);
      });
      return files;
    },

    /** ZIP dokumentasi: `<slug-nama>-docs.zip` berisi `NN-<slug>.md` per halaman yang ada (M7-14/M7-20). */
    exportDocs(
      userId: string,
      id: string,
    ): { filename: string; body: Uint8Array<ArrayBuffer> } {
      const row = own(userId, id);
      const files = api.docFiles(userId, id);
      if (Object.keys(files).length === 0) {
        throw new AppError("NOT_FOUND", codebaseCopy.errors.noDocs);
      }
      const bytes = Object.fromEntries(
        Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
      );
      return {
        filename: `${slugify(row.name, "proyek")}-docs.zip`,
        // Waktu tetap agar ZIP yang sama menghasilkan byte yang sama; disalin ke ArrayBuffer biasa agar
        // bisa langsung menjadi isi `Response` (sama dengan ekspor plan).
        body: new Uint8Array(zipSync(bytes, { mtime: new Date("2026-01-01T00:00:00Z") })),
      };
    },
  };
  return api;
}

export type CodebaseService = ReturnType<typeof createCodebaseService>;
