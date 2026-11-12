"use client";

import { type ApiResult, apiRequest, postJson } from "@/lib/api-client";
import type {
  AnalysisEstimate,
  Codebase,
  CodebaseLanguage,
  CodebaseSource,
  DocPage,
  DocProposal,
  DocSlug,
  DocVersion,
} from "../schemas";

/** Satu halaman beserta riwayat dan usulannya (bentuk `GET .../docs?slug=`). */
export type DocDetail = {
  page: DocPage;
  versions: DocVersion[];
  proposal: DocProposal | null;
};

const base = (id: string) => `/api/codebase/${id}`;
type WithCodebase = { codebase: Codebase };

/** Pemanggil API fitur codebase dari klien; semua mengembalikan {@link ApiResult} tanpa melempar. */
export const codebaseApi = {
  create: (body: { name: string; source: CodebaseSource; language: CodebaseLanguage }) =>
    postJson<WithCodebase>("/api/codebase/create", body),

  /** Badan = byte ZIP mentah (bukan multipart); nama berkas di header, di-encode URI. */
  uploadZip: (id: string, file: File): Promise<ApiResult<WithCodebase>> =>
    apiRequest<WithCodebase>(`${base(id)}/upload`, {
      method: "POST",
      body: file,
      headers: {
        "content-type": "application/zip",
        "x-file-name": encodeURIComponent(file.name),
      },
    }),

  github: (id: string, body: { url: string; token?: string }) =>
    postJson<WithCodebase>(`${base(id)}/github`, body),

  rename: (id: string, name: string) =>
    apiRequest<WithCodebase>(base(id), {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  remove: (id: string) =>
    apiRequest<{ ok: true; keptPlans: number }>(base(id), { method: "DELETE" }),

  start: (id: string, confirmed: boolean) =>
    postJson<
      | { started: true; codebase: Codebase }
      | { started: false; estimate: AnalysisEstimate }
    >(`${base(id)}/analyze`, { confirmed }),
  retry: (id: string) => postJson<WithCodebase>(`${base(id)}/analyze/retry`),
  cancel: (id: string) => postJson<WithCodebase>(`${base(id)}/analyze/cancel`),

  createToken: (id: string) =>
    postJson<{ token: string; expiresAt: string }>(`${base(id)}/agent-token`),
  revokeToken: (id: string) =>
    apiRequest<{ revoked: number }>(`${base(id)}/agent-token`, { method: "DELETE" }),
  importMarkdown: (id: string, markdown: string) =>
    postJson<{ added: DocSlug[]; proposed: DocSlug[]; fixes: string[] }>(
      `${base(id)}/import-markdown`,
      { markdown },
    ),

  doc: (id: string, slug: DocSlug, version?: number) =>
    apiRequest<DocDetail>(
      `${base(id)}/docs?slug=${slug}${version === undefined ? "" : `&version=${version}`}`,
    ),
  saveDoc: (id: string, slug: DocSlug, content: string) =>
    postJson<DocDetail>(`${base(id)}/docs`, { slug, content }),
  restoreDoc: (id: string, slug: DocSlug, version: number) =>
    postJson<DocDetail>(`${base(id)}/docs/restore`, { slug, version }),
  resolveProposal: (id: string, slug: DocSlug, action: "accept" | "reject") =>
    postJson<DocDetail>(`${base(id)}/docs/proposal`, { slug, action }),
};

export const exportHref = (id: string) => `${base(id)}/export`;
export const streamHref = (id: string) => `${base(id)}/stream`;
export const codebaseHref = (id: string, slug?: DocSlug) =>
  `/codebases/${id}${slug ? `?page=${slug}` : ""}`;

/** Ukuran berkas untuk dibaca manusia (KB/MB, desimal koma). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
