"use client";

import { codebaseCopy } from "../copy";
import { codebaseApi } from "./codebase-api";
import { githubUrlError } from "./source-fields";

export type SourceDraft =
  | { kind: "agent" }
  | { kind: "zip"; file: File | null }
  | { kind: "github"; url: string; token: string };

export type SourceField = "file" | "url" | "token" | "form";
export type SourceProblem = { field: SourceField; message: string };

const TOKEN_PATTERN = /^[A-Za-z0-9_]*$/;

/** Validasi di klien sebelum mengirim (server tetap memeriksa ulang semuanya). */
export function checkSource(
  draft: SourceDraft,
  maxUploadMb: number,
): SourceProblem | null {
  if (draft.kind === "zip") {
    if (!draft.file) return { field: "file", message: codebaseCopy.ui.zip.required };
    if (draft.file.size > maxUploadMb * 1024 * 1024) {
      return { field: "file", message: codebaseCopy.zip.tooLarge(maxUploadMb) };
    }
  }
  if (draft.kind === "github") {
    const urlError = githubUrlError(draft.url);
    if (urlError) return { field: "url", message: urlError };
    if (!TOKEN_PATTERN.test(draft.token.trim())) {
      return { field: "token", message: codebaseCopy.github.tokenFormat };
    }
  }
  return null;
}

/**
 * Mengirim sumber ke codebase yang sudah ada. Galat server dipetakan ke kolomnya: ZIP ke `file`,
 * GitHub ke `url` kecuali galat token. Jalur agen tidak mengirim apa pun di sini.
 */
export async function sendSource(
  id: string,
  draft: SourceDraft,
): Promise<SourceProblem | null> {
  if (draft.kind === "agent") return null;
  if (draft.kind === "zip") {
    if (!draft.file) return { field: "file", message: codebaseCopy.ui.zip.required };
    const result = await codebaseApi.uploadZip(id, draft.file);
    return result.ok ? null : { field: "file", message: result.error.error };
  }
  const token = draft.token.trim();
  const result = await codebaseApi.github(id, {
    url: draft.url.trim(),
    ...(token ? { token } : {}),
  });
  if (result.ok) return null;
  // Pesan "repo tidak ditemukan" juga menyebut token sebagai saran; hanya dianggap galat token bila
  // pengguna memang mengisinya.
  const tokenIssue =
    result.error.issues?.some((issue) => issue.path === "token") ||
    (token !== "" && /token/i.test(result.error.error));
  return { field: tokenIssue ? "token" : "url", message: result.error.error };
}
