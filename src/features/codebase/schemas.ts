import { z } from "zod";
import { codebaseCopy } from "./copy";

export const CODEBASE_LANGUAGES = ["id", "en"] as const;
export type CodebaseLanguage = (typeof CODEBASE_LANGUAGES)[number];

export const CODEBASE_SOURCES = ["agent", "zip", "github"] as const;
export type CodebaseSource = (typeof CODEBASE_SOURCES)[number];

export const CODEBASE_STATUSES = [
  "awaiting_source",
  "source_ready",
  "analyzing",
  "ready",
  "failed",
] as const;
export type CodebaseStatus = (typeof CODEBASE_STATUSES)[number];

export const DOC_ORIGINS = ["agent", "ai", "manual"] as const;
export type DocOrigin = (typeof DOC_ORIGINS)[number];

/**
 * Halaman dokumentasi standar dengan urutan tetap (ADR 0016). Judul ditentukan di sini, bukan oleh
 * pengirim, agar kiriman agen atau keluaran model tidak bisa menyisipkan judul sendiri.
 */
export const DOC_PAGES = [
  { slug: "ringkasan", title: { id: "Ringkasan", en: "Overview" } },
  { slug: "teknologi", title: { id: "Teknologi", en: "Tech stack" } },
  { slug: "struktur-folder", title: { id: "Struktur folder", en: "Folder structure" } },
  { slug: "arsitektur", title: { id: "Arsitektur", en: "Architecture" } },
  { slug: "modul", title: { id: "Modul", en: "Modules" } },
  { slug: "data", title: { id: "Model data", en: "Data model" } },
  { slug: "api", title: { id: "API dan rute", en: "API and routes" } },
  { slug: "alur-utama", title: { id: "Alur utama", en: "Main flows" } },
  { slug: "menjalankan", title: { id: "Cara menjalankan", en: "Running locally" } },
  {
    slug: "catatan",
    title: { id: "Catatan dan utang teknis", en: "Notes and tech debt" },
  },
] as const satisfies readonly {
  slug: string;
  title: Record<CodebaseLanguage, string>;
}[];

export type DocSlug = (typeof DOC_PAGES)[number]["slug"];
export const DOC_SLUGS = DOC_PAGES.map((page) => page.slug) as [DocSlug, ...DocSlug[]];

/** Judul halaman standar dalam bahasa dokumentasi. */
export function docTitle(slug: DocSlug, language: CodebaseLanguage): string {
  const page = DOC_PAGES.find((p) => p.slug === slug);
  // `slug` bertipe DocSlug sehingga selalu ditemukan; cadangan hanya untuk keamanan tipe.
  return page ? page.title[language] : slug;
}

/** Posisi halaman dalam urutan standar (untuk mengurutkan hasil query). */
export const docOrder = (slug: string): number => {
  const index = DOC_SLUGS.indexOf(slug as DocSlug);
  return index === -1 ? DOC_SLUGS.length : index;
};

export const NAME_MAX_LENGTH = 120;
/** Isi maks. per halaman (ADR 0016). */
export const DOC_CONTENT_MAX_LENGTH = 40_000;

const idSchema = z.string().min(1).max(64);
const nameSchema = z
  .string()
  .trim()
  .min(1, "Isi nama proyek.")
  .max(NAME_MAX_LENGTH, `Maksimal ${NAME_MAX_LENGTH} karakter.`);

export const docSlugSchema = z.enum(DOC_SLUGS);

/** Badan `POST /api/codebase/create`. Sumber kode dikirim terpisah sesuai jalurnya. */
export const createCodebaseSchema = z.object({
  name: nameSchema,
  source: z.enum(CODEBASE_SOURCES),
  language: z.enum(CODEBASE_LANGUAGES).default("id"),
});
export type CreateCodebaseInput = z.infer<typeof createCodebaseSchema>;

/** Badan `PATCH /api/codebase/:id`: hanya nama yang boleh diubah langsung. */
export const patchCodebaseSchema = z.object({ name: nameSchema });
export type PatchCodebaseInput = z.infer<typeof patchCodebaseSchema>;

export const codebaseIdParamsSchema = z.object({ id: idSchema });

/** Panjang maks. URL GitHub yang diterima (URL repo + cabang + subfolder). */
export const GITHUB_URL_MAX_LENGTH = 500;

/**
 * Badan `POST /api/codebase/:id/github`. URL diurai service (`parseGithubUrl`) agar pesannya spesifik.
 * `token` (P1, repo privat) dipakai di memori untuk satu unduhan, tidak disimpan dan tidak dicatat; pola
 * karakternya juga mencegah penyisipan header.
 */
export const githubSourceSchema = z.object({
  url: z.string().trim().min(1, "Isi URL repo GitHub.").max(GITHUB_URL_MAX_LENGTH),
  token: z
    .string()
    .trim()
    .max(255)
    .regex(/^[A-Za-z0-9_]*$/, codebaseCopy.github.tokenFormat)
    .optional()
    .transform((value) => value || undefined),
});
/** Masukan service (keluaran skema cocok dengan bentuk ini; `token` kosong sudah menjadi `undefined`). */
export type GithubSourceInput = { url: string; token?: string };

/** Query `GET /api/codebase/:id/docs`: tanpa `slug` = daftar halaman; `version` butuh `slug`. */
export const docsQuerySchema = z
  .object({
    slug: docSlugSchema.optional(),
    version: z.coerce.number().int().min(1).optional(),
  })
  .refine((q) => q.version === undefined || q.slug !== undefined, {
    message: "version hanya bisa dipakai bersama slug",
    path: ["version"],
  });
export type DocsQuery = z.infer<typeof docsQuerySchema>;

/** Satu halaman yang dikirim agen atau dihasilkan model (judul dari {@link DOC_PAGES}). */
export const docPageInputSchema = z.object({
  slug: docSlugSchema,
  content: z.string().max(DOC_CONTENT_MAX_LENGTH),
});
export type DocPageInput = z.infer<typeof docPageInputSchema>;

const STACK_VALUE_MAX_LENGTH = 80;
const stackValueSchema = z.string().trim().min(1).max(STACK_VALUE_MAX_LENGTH);

/**
 * Teknologi yang terdeteksi (bentuk kolom `codebases.detected_stack`). Juga dipakai untuk kiriman agen,
 * jadi panjang dan jumlahnya dibatasi.
 */
export const detectedStackSchema = z.object({
  languages: z.array(stackValueSchema).max(20),
  frontend: stackValueSchema.optional(),
  backend: stackValueSchema.optional(),
  database: stackValueSchema.optional(),
  deployment: stackValueSchema.optional(),
  tools: z.array(stackValueSchema).max(30),
});
export type DetectedStack = z.infer<typeof detectedStackSchema>;

/**
 * Badan `POST /api/codebase/agent/submit` (ADR 0016): ketat (kunci tak dikenal ditolak), slug standar dan
 * unik, isi tidak kosong. Judul tidak bisa dikirim; selalu dari {@link DOC_PAGES}.
 */
export const agentSubmitSchema = z.strictObject({
  pages: z
    .array(
      z.strictObject({
        slug: docSlugSchema,
        content: z
          .string()
          .trim()
          .min(
            1,
            "Isi halaman tidak boleh kosong; jangan kirim halaman yang tidak relevan.",
          )
          .max(DOC_CONTENT_MAX_LENGTH),
      }),
    )
    .min(1, "Kirim minimal satu halaman.")
    .max(DOC_PAGES.length)
    .refine((pages) => new Set(pages.map((p) => p.slug)).size === pages.length, {
      message: "Setiap slug hanya boleh dikirim sekali.",
    }),
  detectedStack: detectedStackSchema.optional(),
});
export type AgentSubmitInput = z.infer<typeof agentSubmitSchema>;

/** Badan `POST /api/codebase/:id/docs`: edit manual satu halaman → versi baru `origin = manual`. */
export const saveDocSchema = z.object({
  slug: docSlugSchema,
  content: z
    .string()
    .trim()
    .min(1, "Halaman tidak boleh kosong.")
    .max(
      DOC_CONTENT_MAX_LENGTH,
      `Maksimal ${DOC_CONTENT_MAX_LENGTH.toLocaleString("id-ID")} karakter.`,
    ),
});

/** Badan `POST /api/codebase/:id/docs/restore`: salin versi lama menjadi versi terbaru. */
export const restoreDocSchema = z.object({
  slug: docSlugSchema,
  version: z.number().int().min(1),
});

/** Badan `POST /api/codebase/:id/docs/proposal`: terima atau tolak usulan analisis ulang. */
export const proposalActionSchema = z.object({
  slug: docSlugSchema,
  action: z.enum(["accept", "reject"]),
});

/** Badan `POST /api/codebase/:id/analyze`: `confirmed` = pengguna sudah melihat perkiraan biaya. */
export const startAnalysisSchema = z.object({ confirmed: z.boolean().default(false) });

/** Badan `POST /api/codebase/:id/import-markdown` (jalur cadangan "Tempel hasil"). */
export const importMarkdownSchema = z.object({
  markdown: z
    .string()
    .min(1, "Tempelkan hasil dari agen.")
    .max(DOC_PAGES.length * DOC_CONTENT_MAX_LENGTH + 10_000),
});

/** Berkas teks yang dipertahankan pemindai; `key` = jenis berkas kunci (mis. `readme`). */
export type ManifestFile = {
  path: string;
  size: number;
  language: string | null;
  key: string | null;
};

/** Ringkasan sumber yang diterima (bentuk kolom `codebases.manifest`, ADR 0016). */
export type CodebaseManifest = {
  files: ManifestFile[];
  totalFiles: number;
  totalBytes: number;
  skipped: Record<string, number>;
  redactions: number;
  redactedFiles: number;
  languages: Record<string, number>;
};

/** Ringkasan manifes untuk klien: tanpa daftar berkas lengkap (bisa ribuan baris). */
export type ManifestSummary = Omit<CodebaseManifest, "files">;

export type Codebase = {
  id: string;
  name: string;
  language: CodebaseLanguage;
  source: CodebaseSource;
  sourceRef: string | null;
  status: CodebaseStatus;
  error: string | null;
  detectedStack: DetectedStack;
  manifest: ManifestSummary | null;
  sourceReceivedAt: string | null;
  analyzedAt: string | null;
  analysisSummary: AnalysisSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type DocSummary = {
  slug: DocSlug;
  title: string;
  version: number;
  origin: DocOrigin;
  createdAt: string;
  /** Pernah diedit manual (ditandai di penampil; analisis ulang menjadi usulan, M7-16). */
  edited: boolean;
  /** Ada usulan hasil analisis ulang yang menunggu diterima/ditolak. */
  hasProposal: boolean;
};

/** Usulan hasil analisis ulang untuk halaman yang diedit manual (lihat berdampingan, terima/tolak). */
export type DocProposal = {
  content: string;
  origin: DocOrigin;
  baseVersion: number;
  createdAt: string;
};

/** Ringkasan perubahan dokumentasi dari analisis/kiriman terakhir. */
export type AnalysisSummary = {
  at: string;
  origin: "agent" | "ai";
  added: DocSlug[];
  changed: DocSlug[];
  unchanged: DocSlug[];
  proposed: DocSlug[];
  /** Analisis server saja: berkas yang dipotong / tidak ikut agar muat anggaran (kosong = 0). */
  truncatedFiles?: number;
  droppedFiles?: number;
};

export type DocPage = DocSummary & { content: string };

export type DocVersion = { version: number; origin: DocOrigin; createdAt: string };

/** Fase job analisis (M7-10, M7-13). */
export const ANALYSIS_PHASES = [
  "queued",
  "profile",
  "summarize",
  "pages",
  "done",
] as const;
export type AnalysisPhase = (typeof ANALYSIS_PHASES)[number];

export type ConfirmReason = "cost" | "budget" | "unknown_price";

export type AnalysisEstimate = {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** null bila harga model belum diketahui sebelum dijalankan (model OpenRouter). */
  costUsd: number | null;
  files: number;
  chunks: number;
  /** Berkas yang dipotong / tidak ikut karena anggaran token. */
  truncatedFiles: number;
  droppedFiles: number;
  needsConfirmation: boolean;
  reasons: { kind: ConfirmReason; message: string }[];
};

export type AnalysisStatus = {
  status: Codebase["status"];
  error: string | null;
  job: {
    id: string;
    /** Keadaan job (`queued`, `running`, `succeeded`, `failed`, `cancelled`). */
    state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    phase: AnalysisPhase;
    done: number;
    total: number;
  } | null;
};
