import "server-only";

import { readBodyLimited } from "@/server/http/body";
import { AppError } from "@/server/http/errors";
import { codebaseCopy } from "../copy";
import type { GithubUrl } from "../github-url";

const API_HOST = "api.github.com";
/** Satu-satunya host tujuan pengalihan `zipball` yang diterima (pencegahan SSRF, ADR 0016). */
const DOWNLOAD_HOST = "codeload.github.com";
const MAX_API_REDIRECTS = 3;
/** Cabang bisa mengandung `/`; dicoba dari prefiks terpendek, maks. sekian segmen. */
const MAX_REF_SEGMENTS = 4;
const API_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export type GithubFetch = (url: string, init: RequestInit) => Promise<Response>;

export type GithubDownloadOptions = {
  fetch: GithubFetch;
  maxBytes: number;
  /** Token akses pribadi untuk repo privat: hanya dikirim ke `api.github.com`, tidak disimpan/dicatat. */
  token?: string;
  apiTimeoutMs?: number;
  downloadTimeoutMs?: number;
  now?: () => number;
};

export type GithubDownload = {
  bytes: Uint8Array;
  /** Cabang/tag/commit yang diunduh (cabang bawaan bila URL tidak menyebut `/tree/`). */
  ref: string;
  /** Subfolder di dalam repo, atau null untuk seluruh repo. */
  subfolder: string | null;
};

const copy = codebaseCopy.github;
const fail = (message: string, status?: number) =>
  new AppError("VALIDATION", message, status);

/** Segmen jalur di-encode satu per satu agar `/` di nama cabang tetap menjadi pemisah. */
const encodePath = (segments: readonly string[]) =>
  segments.map((s) => encodeURIComponent(s)).join("/");

const isRedirect = (res: Response) => res.status >= 300 && res.status < 400;

/** Tujuan pengalihan bila https, tanpa kredensial/port, dan tepat di `host`; selain itu null. */
function allowedRedirect(location: string | null, host: string): string | null {
  if (!location) return null;
  try {
    const url = new URL(location, `https://${API_HOST}`);
    const ok =
      url.protocol === "https:" &&
      url.hostname === host &&
      url.port === "" &&
      url.username === "" &&
      url.password === "";
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Badan respons yang tidak dipakai dibuang agar koneksi bisa dipakai ulang. */
const discard = (res: Response) => res.body?.cancel().catch(() => undefined);

/**
 * Mengunduh arsip repo GitHub publik (atau privat dengan token) sebagai byte ZIP.
 *
 * Langkah: `GET /repos/:o/:r` (cabang bawaan) → bila ada `/tree/…`, cari batas cabang/subfolder lewat
 * `GET /repos/:o/:r/commits/:ref` dari prefiks terpendek → `GET /repos/:o/:r/zipball/:ref` yang
 * dialihkan ke `codeload.github.com`. Semua alamat disusun dari host tetap; pengalihan diikuti manual dan
 * hanya ke host yang diizinkan. Token tidak pernah dikirim ke `codeload` dan tidak ikut di galat.
 *
 * @throws {AppError} `VALIDATION` dengan pesan pengguna (404 repo/cabang tidak ada, 413 terlalu besar,
 *   429 batas laju, 502 jawaban aneh, 504 terlalu lama, 503 tidak bisa dihubungi).
 */
export async function downloadGithubRepo(
  target: GithubUrl,
  options: GithubDownloadOptions,
): Promise<GithubDownload> {
  const { token, maxBytes } = options;
  const now = options.now ?? Date.now;
  const apiTimeout = options.apiTimeoutMs ?? API_TIMEOUT_MS;
  const downloadTimeout = options.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  const apiHeaders: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    // GitHub menolak permintaan API tanpa User-Agent.
    "user-agent": "piard",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const repoPath = `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;

  /** Galat umum dari jawaban API; `404` bermakna "repo tidak ada/privat" kecuali pemanggil menangani. */
  function apiError(res: Response): AppError {
    const rateLimited =
      res.status === 429 ||
      (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
    if (rateLimited) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const minutes =
        Number.isFinite(reset) && reset > 0
          ? Math.max(1, Math.ceil((reset * 1000 - now()) / 60_000))
          : 60;
      return fail(copy.rateLimited(minutes), 429);
    }
    if (res.status === 401) return fail(copy.badToken);
    if (res.status === 403) return fail(copy.forbidden, 403);
    if (res.status === 404)
      return fail(token ? copy.notFoundWithToken : copy.notFound, 404);
    if (res.status === 409) return fail(copy.emptyRepo);
    return fail(copy.unexpected, 502);
  }

  /** GET ke API; pengalihan (repo yang diganti nama menjawab 301) diikuti hanya ke `api.github.com`. */
  async function api(path: string, accept?: string): Promise<Response> {
    let url = `https://${API_HOST}${path}`;
    for (let hop = 0; ; hop += 1) {
      const res = await options.fetch(url, {
        headers: accept ? { ...apiHeaders, accept } : apiHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(apiTimeout),
      });
      if (!isRedirect(res)) return res;
      await discard(res);
      const next = allowedRedirect(res.headers.get("location"), API_HOST);
      if (!next || hop >= MAX_API_REDIRECTS) throw fail(copy.unexpected, 502);
      url = next;
    }
  }

  try {
    const repoRes = await api(repoPath);
    if (!repoRes.ok) {
      await discard(repoRes);
      throw apiError(repoRes);
    }
    const info = (await repoRes.json()) as { default_branch?: unknown };
    if (typeof info.default_branch !== "string" || info.default_branch === "") {
      throw fail(copy.emptyRepo);
    }

    let ref = info.default_branch;
    let subfolder: string | null = null;
    if (target.tree.length > 0) {
      let found = false;
      const limit = Math.min(target.tree.length, MAX_REF_SEGMENTS);
      for (let i = 1; i <= limit && !found; i += 1) {
        const candidate = target.tree.slice(0, i);
        // Hanya SHA (teks pendek), bukan objek commit lengkap.
        const res = await api(
          `${repoPath}/commits/${encodePath(candidate)}`,
          "application/vnd.github.sha",
        );
        await discard(res);
        if (res.ok) {
          ref = candidate.join("/");
          subfolder = target.tree.slice(i).join("/") || null;
          found = true;
        } else if (res.status !== 404 && res.status !== 422) {
          throw apiError(res);
        }
      }
      if (!found) throw fail(copy.refNotFound(target.tree.join("/")), 404);
    }

    // zipball menjawab 302 ke codeload (URL sementara; untuk repo privat berisi token sekali pakai).
    const zipball = await options.fetch(
      `https://${API_HOST}${repoPath}/zipball/${encodePath(ref.split("/"))}`,
      {
        headers: apiHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(apiTimeout),
      },
    );
    await discard(zipball);
    if (!isRedirect(zipball)) throw apiError(zipball);
    const location = allowedRedirect(zipball.headers.get("location"), DOWNLOAD_HOST);
    if (!location) throw fail(copy.unexpected, 502);

    // Tanpa header Authorization: codeload tidak membutuhkannya dan token tidak boleh keluar dari API.
    const download = await options.fetch(location, {
      headers: { "user-agent": "piard" },
      redirect: "manual",
      signal: AbortSignal.timeout(downloadTimeout),
    });
    if (!download.ok) {
      await discard(download);
      throw download.status === 404
        ? fail(copy.refNotFound(ref), 404)
        : apiError(download);
    }
    const mb = Math.round(maxBytes / (1024 * 1024));
    const bytes = await readBodyLimited(download, maxBytes, {
      tooLarge: copy.tooLarge(mb),
      empty: copy.emptyDownload,
    });
    return { bytes, ref, subfolder };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Galat jaringan tidak diteruskan sebagai `cause`: pesannya bisa memuat URL codeload bertoken.
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw fail(copy.timeout, 504);
    throw fail(copy.unreachable, 503);
  }
}
