import { z } from "zod";

const idSchema = z.string().min(1).max(64);

/** Judul dokumen PRD di tabel `documents` (situs acuan: `title: "PRD"`). */
export const PRD_TITLE = "PRD";

/** Batas isi PRD yang disimpan pengguna (Markdown); jauh di atas PRD normal (±10 ribu karakter). */
export const PRD_MAX_LENGTH = 100_000;

export const generatePrdSchema = z.object({
  planId: idSchema,
  /** Menulis PRD baru walau sudah ada; hasilnya menjadi versi berikutnya, versi lama tetap ada. */
  regenerate: z.boolean().default(false),
});

export const prdQuerySchema = z.object({ planId: idSchema });

const versionSchema = z.coerce.number().int().min(1);

export const saveDocumentSchema = z.object({
  planId: idSchema,
  content: z
    .string()
    .max(
      PRD_MAX_LENGTH,
      `PRD paling panjang ${PRD_MAX_LENGTH.toLocaleString("id-ID")} karakter.`,
    )
    .refine((value) => value.trim().length > 0, "PRD tidak boleh kosong."),
});
export type SaveDocumentInput = z.infer<typeof saveDocumentSchema>;

export const restoreDocumentSchema = z.object({
  planId: idSchema,
  version: versionSchema,
});

export const documentQuerySchema = z.object({
  planId: idSchema,
  /** Tanpa versi: daftar semua versi (tanpa isi). Dengan versi: satu dokumen lengkap. */
  version: versionSchema.optional(),
});

/** Satu versi PRD (baris `documents`), bentuk `documents[]` situs acuan. */
export const prdDocumentSchema = z.object({
  id: z.string(),
  planId: z.string(),
  title: z.string(),
  content: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
});
export type PrdDocument = z.infer<typeof prdDocumentSchema>;

/** Ringkasan satu versi untuk riwayat (isi tidak ikut agar daftar tetap ringan). */
export const prdVersionSchema = prdDocumentSchema.pick({
  id: true,
  version: true,
  createdAt: true,
});
export type PrdVersion = z.infer<typeof prdVersionSchema>;

/**
 * Keadaan PRD sebuah plan: `idle` belum ada, `generating` job berjalan (`draft` berisi teks sejauh
 * ini), `ready` ada versi tersimpan, `failed` job terakhir gagal (versi lama, bila ada, tetap ada).
 */
export const PRD_STATUSES = ["idle", "generating", "ready", "failed"] as const;
export type PrdStatus = (typeof PRD_STATUSES)[number];

export const PRD_PHASES = ["queued", "writing", "saving", "done"] as const;
export type PrdPhase = (typeof PRD_PHASES)[number];

/** Jenis job PRD: menulis dari roadmap, atau merevisi versi terbaru (chat). */
export const PRD_JOB_KINDS = ["generate", "revise"] as const;
export type PrdJobKind = (typeof PRD_JOB_KINDS)[number];

export const reviseSchema = z.object({
  planId: idSchema,
  /** Perubahan yang diminta; kosong = ulangi revisi terakhir (tombol "Coba lagi"). */
  instructions: z.string().trim().max(4_000).optional(),
});
export const prdStateSchema = z.object({
  status: z.enum(PRD_STATUSES),
  /** Versi terbaru; `null` bila belum pernah tersimpan. */
  document: prdDocumentSchema.nullable(),
  /** Teks yang sedang ditulis AI; kosong di luar `generating`. */
  draft: z.string(),
  job: z
    .object({
      id: z.string(),
      kind: z.enum(PRD_JOB_KINDS),
      phase: z.enum(PRD_PHASES),
      /** Jumlah bagian (dari 7) yang sudah mulai ditulis. */
      sections: z.number().int(),
      error: z.string().nullable(),
    })
    .nullable(),
});
export type PrdState = z.infer<typeof prdStateSchema>;
