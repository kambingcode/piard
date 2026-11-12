import "server-only";

import {
  bearerTokenKind,
  generateBearerToken,
  readBearerToken,
  sameHash,
} from "@/server/http/bearer-token";
import { AppError, ValidationError } from "@/server/http/errors";
import { isLocalOrigin } from "../agent-prompt";
import { codebaseCopy } from "../copy";
import {
  AGENT_RATE_MAX,
  AGENT_RATE_WINDOW_MS,
  AGENT_SUBMIT_MAX_BYTES,
  AGENT_TOKEN_TTL_MS,
} from "../limits";
import {
  type ImportFix,
  type ImportProblem,
  splitPiardMarkdown,
} from "../markdown-import";
import { redactSecrets } from "../scan/redact";
import {
  agentSubmitSchema,
  type DetectedStack,
  DOC_SLUGS,
  type DocSlug,
} from "../schemas";
import { type PageOutcome, summarizeOutcomes, writeGeneratedPage } from "./docs-writer";
import type { AgentTokenRow, CodebaseRepo, CodebaseRow } from "./repo";

/** `pcb_` + 32 byte base64url (43 karakter). Bentuk lain ditolak sebelum menyentuh database. */
const TOKEN_KIND = bearerTokenKind("pcb_");
const HTTP_TOO_MANY_REQUESTS = 429;

/** Satu galat untuk semua penolakan token: penyerang tidak tahu apakah token pernah ada. */
const unauthorized = () => new AppError("UNAUTHORIZED", codebaseCopy.agent.unauthorized);

function importProblemMessage(problem: ImportProblem): string {
  const copy = codebaseCopy.agent.import;
  switch (problem.kind) {
    case "no_markers":
      return copy.noMarkers;
    case "unknown_slug":
      return copy.unknownSlug(problem.slug);
    case "duplicate_slug":
      return copy.duplicateSlug(problem.slug);
    case "too_long":
      return copy.tooLong(problem.slug);
  }
}

export type AgentTokenStatus = {
  active: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

export type AgentSession = { token: AgentTokenRow; codebase: CodebaseRow };

export type AgentSubmitResult = {
  codebaseId: string;
  /** Slug yang mendapat versi baru (isi yang sama dengan versi terbaru tidak menambah versi). */
  added: DocSlug[];
  /** Slug yang versi terbarunya edit manual: kiriman menjadi usulan, tidak menimpa (M7-16). */
  proposed: DocSlug[];
  /** Jumlah nilai yang disensor dari kiriman (agen seharusnya tidak mengirim rahasia). */
  redactions: number;
};

/**
 * Jalur agen (ADR 0016, M7-07): token sekali tampil untuk satu codebase dan penerimaan halaman
 * dokumentasi jadi dari agen lokal. Token mentah tidak pernah disimpan, dicatat, atau dikembalikan
 * selain saat dibuat.
 */
export function createAgentService(
  repo: CodebaseRepo,
  deps: {
    now?: () => Date;
    own: (userId: string, id: string) => CodebaseRow;
    /** Origin publik dari `APP_URL`; null = origin permintaan. */
    appUrl?: string | null;
  },
) {
  const now = deps.now ?? (() => new Date());

  /**
   * Halaman jadi dari agen → versi baru (`origin = agent`), judul dari server, isi disensor seperti isi
   * repo. Isi yang sama tidak menambah versi; halaman yang terakhir diedit manual menerima usulan, bukan
   * versi baru. Status codebase menjadi `ready` dengan ringkasan perubahan.
   */
  function savePages(
    codebase: CodebaseRow,
    input: readonly { slug: DocSlug; content: string }[],
    detectedStack?: DetectedStack,
  ): AgentSubmitResult {
    if (codebase.status === "analyzing") {
      throw new AppError("CONFLICT", codebaseCopy.agent.busy);
    }
    let redactions = 0;
    const outcomes: Partial<Record<string, PageOutcome>> = {};
    for (const page of input) {
      const { text, count } = redactSecrets(`piard-docs/${page.slug}.md`, page.content);
      redactions += count;
      outcomes[page.slug] = writeGeneratedPage(repo, codebase, page.slug, text, "agent");
    }
    const at = now();
    const summary = summarizeOutcomes(outcomes, "agent", at);
    repo.update(codebase.userId, codebase.id, {
      status: "ready",
      error: null,
      analyzedAt: at,
      analysisSummary: summary,
      ...(detectedStack ? { detectedStack } : {}),
    });
    const added = DOC_SLUGS.filter(
      (slug) => summary.added.includes(slug) || summary.changed.includes(slug),
    );
    return {
      codebaseId: codebase.id,
      added,
      proposed: DOC_SLUGS.filter((slug) => summary.proposed.includes(slug)),
      redactions,
    };
  }

  return {
    /** Token baru (token lama dicabut). Mentahnya hanya ada di respons ini. */
    createToken(userId: string, id: string): { token: string; expiresAt: string } {
      deps.own(userId, id);
      const { token, hash } = generateBearerToken(TOKEN_KIND);
      const at = now();
      const expiresAt = new Date(at.getTime() + AGENT_TOKEN_TTL_MS);
      repo.replaceAgentToken(id, hash, expiresAt, at);
      return { token, expiresAt: expiresAt.toISOString() };
    },

    revokeTokens(userId: string, id: string): { revoked: number } {
      deps.own(userId, id);
      return { revoked: repo.revokeAgentTokens(id, now()) };
    },

    /** Ada tidaknya token aktif (tanpa token itu sendiri), untuk halaman proyek. */
    tokenStatus(userId: string, id: string): AgentTokenStatus {
      deps.own(userId, id);
      const row = repo.activeAgentToken(id, now());
      return {
        active: Boolean(row),
        expiresAt: row ? row.expiresAt.toISOString() : null,
        lastUsedAt: row?.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      };
    },

    /**
     * Origin Piard untuk prompt agen: `APP_URL` bila diisi, selain itu origin yang sedang dibuka pengguna.
     * `local` = hanya agen di mesin yang sama yang bisa menjangkaunya (prompt menampilkan peringatan).
     */
    baseUrl(requestOrigin: string): { baseUrl: string; local: boolean } {
      const baseUrl = deps.appUrl ?? new URL(requestOrigin).origin;
      return { baseUrl, local: isLocalOrigin(baseUrl) };
    },

    /** Batas badan kiriman, untuk dibaca route sebelum badan dibaca. */
    submitLimit() {
      return {
        bytes: AGENT_SUBMIT_MAX_BYTES,
        messages: {
          tooLarge: codebaseCopy.agent.tooLarge,
          empty: codebaseCopy.agent.empty,
        },
      };
    },

    /**
     * Memverifikasi header `Authorization: Bearer pcb_…` **sebelum** badan dibaca, lalu mencatat
     * pemakaian untuk batas laju.
     *
     * @throws {AppError} `UNAUTHORIZED` (seragam) atau 429 bila batas laju terlampaui.
     */
    authenticate(authorization: string | null): AgentSession {
      const presented = readBearerToken(authorization, TOKEN_KIND);
      if (!presented) throw unauthorized();
      const row = repo.findAgentTokenByHash(presented.hash);
      // Pencarian lewat indeks unik hash; pembandingan ulang dengan waktu konstan sebagai lapisan kedua.
      if (!row || !sameHash(row.tokenHash, presented.hash)) throw unauthorized();
      const at = now();
      if (row.revokedAt || row.expiresAt <= at) throw unauthorized();
      const codebase = repo.findById(row.codebaseId);
      if (!codebase) throw unauthorized();

      const count = repo.countAgentTokenUse(row.id, at, AGENT_RATE_WINDOW_MS);
      if (count > AGENT_RATE_MAX) {
        const started = row.windowStartedAt?.getTime() ?? at.getTime();
        const minutes = Math.max(
          1,
          Math.ceil((started + AGENT_RATE_WINDOW_MS - at.getTime()) / 60_000),
        );
        throw new AppError(
          "VALIDATION",
          codebaseCopy.agent.rateLimited(minutes),
          HTTP_TOO_MANY_REQUESTS,
        );
      }
      return { token: row, codebase };
    },

    /**
     * Menyimpan halaman kiriman agen sebagai versi baru (`origin = agent`); kiriman ulang menambah versi,
     * tidak menimpa. Isi disensor dulu seperti isi repo. Status codebase menjadi `ready`.
     *
     * @throws {ValidationError} badan bukan JSON atau tidak lolos skema; `CONFLICT` saat analisis server.
     */
    submit(session: AgentSession, body: Uint8Array): AgentSubmitResult {
      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder().decode(body));
      } catch {
        throw new AppError("VALIDATION", codebaseCopy.agent.notJson);
      }
      const parsed = agentSubmitSchema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        const first = issues[0];
        throw new ValidationError(
          `Kiriman tidak valid (${first ? `${first.path || "badan"}: ${first.message}` : "tidak valid"}).`,
          issues,
        );
      }

      // Dibaca ulang: status bisa berubah sejak autentikasi (badan dibaca di antaranya).
      const codebase = repo.findById(session.codebase.id);
      if (!codebase) throw unauthorized();
      return savePages(codebase, parsed.data.pages, parsed.data.detectedStack);
    },

    /**
     * Jalur cadangan: hasil agen ditempel pengguna sebagai satu Markdown bersekat (M7-08). Disimpan sama
     * seperti kiriman agen (`origin = agent`).
     *
     * @throws {AppError} `VALIDATION` bila penanda tidak ada atau slug tidak dikenal/ganda.
     */
    importMarkdown(
      userId: string,
      id: string,
      markdown: string,
    ): AgentSubmitResult & { fixes: ImportFix[] } {
      const codebase = deps.own(userId, id);
      const result = splitPiardMarkdown(markdown);
      if (!result.ok) {
        throw new ValidationError(
          result.problems.map(importProblemMessage).join(" "),
          result.problems.map((problem) => ({
            path: "markdown",
            message: importProblemMessage(problem),
          })),
        );
      }
      return { ...savePages(codebase, result.pages), fixes: result.fixes };
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
