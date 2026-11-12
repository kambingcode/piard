import "server-only";

import type { PlansService } from "@/features/plans/server";
import {
  bearerTokenKind,
  generateBearerToken,
  readBearerToken,
  sameHash,
} from "@/server/http/bearer-token";
import { AppError } from "@/server/http/errors";
import { agentBridgeCopy } from "../copy";
import { MAX_ACTIVE_TOKENS, RATE_MAX, RATE_WINDOW_MS, tokenTtlMs } from "../limits";
import type { AgentToken, CreatedToken, CreateTokenInput } from "../schemas";
import type { AgentBridgeRepo, PlanTokenRow } from "./repo";

/** `ppl_` + 32 byte base64url (ADR 0017). */
export const PLAN_TOKEN_KIND = bearerTokenKind("ppl_");
const HTTP_TOO_MANY_REQUESTS = 429;

/** Agen yang terautentikasi: token, plan yang diikatnya, dan pemilik plan. */
export type AgentSession = { token: PlanTokenRow; planId: string; userId: string };

/** Satu galat untuk semua penolakan token: penyerang tidak tahu apakah token pernah ada. */
const unauthorized = () =>
  new AppError("UNAUTHORIZED", agentBridgeCopy.agent.unauthorized);

function toAgentToken(row: PlanTokenRow, now: Date): AgentToken {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    active: !row.revokedAt && row.expiresAt > now,
  };
}

/**
 * Token agen per plan: dibuat pengguna (sekali tampil), didaftar tanpa nilainya, dicabut satu atau semua,
 * dan diverifikasi untuk `/api/agent/*`. Token mentah tidak pernah disimpan atau dicatat.
 */
export function createTokenService(deps: {
  repo: AgentBridgeRepo;
  plans: Pick<PlansService, "getPlan" | "ownerOf">;
  now?: () => Date;
}) {
  const { repo, plans } = deps;
  const now = deps.now ?? (() => new Date());

  /** Token milik plan pengguna; milik orang lain diperlakukan seperti tidak ada. */
  function ownedToken(userId: string, id: string): PlanTokenRow {
    const row = repo.findToken(id);
    if (!row) throw new AppError("NOT_FOUND", agentBridgeCopy.errors.tokenNotFound);
    try {
      plans.getPlan(userId, row.planId);
    } catch {
      throw new AppError("NOT_FOUND", agentBridgeCopy.errors.tokenNotFound);
    }
    return row;
  }

  return {
    create(userId: string, input: CreateTokenInput): CreatedToken {
      const { plan } = plans.getPlan(userId, input.planId);
      const at = now();
      if (repo.countActiveTokens(plan.id, at) >= MAX_ACTIVE_TOKENS) {
        throw new AppError(
          "CONFLICT",
          agentBridgeCopy.errors.tooManyTokens(MAX_ACTIVE_TOKENS),
        );
      }
      const { token, hash } = generateBearerToken(PLAN_TOKEN_KIND);
      const row = repo.insertToken({
        planId: plan.id,
        label: input.label,
        tokenHash: hash,
        expiresAt: new Date(at.getTime() + tokenTtlMs(input.ttlDays)),
      });
      return { token, agentToken: toAgentToken(row, at) };
    },

    list(userId: string, planId: string): AgentToken[] {
      const { plan } = plans.getPlan(userId, planId);
      const at = now();
      return repo.listTokens(plan.id).map((row) => toAgentToken(row, at));
    },

    /** Mencabut satu token; mencabut token yang sudah dicabut tidak apa-apa. */
    revoke(userId: string, id: string): AgentToken {
      const row = ownedToken(userId, id);
      const at = now();
      repo.revokeToken(row.planId, row.id, at);
      return toAgentToken(repo.findToken(row.id) ?? row, at);
    },

    revokeAll(userId: string, planId: string): { revoked: number } {
      const { plan } = plans.getPlan(userId, planId);
      return { revoked: repo.revokeAll(plan.id, now()) };
    },

    /** Label token per id (untuk penanda "AI" di kanban), termasuk yang sudah dicabut. */
    labels(planId: string): Map<string, string> {
      return new Map(repo.listTokens(planId).map((row) => [row.id, row.label]));
    },

    /**
     * Memverifikasi `Authorization: Bearer ppl_…` **sebelum** badan dibaca, lalu mencatat pemakaian
     * untuk batas laju dan `last_used_at`.
     *
     * @throws {AppError} `UNAUTHORIZED` (seragam) atau 429 bila batas laju terlampaui.
     */
    authenticate(authorization: string | null): AgentSession {
      const presented = readBearerToken(authorization, PLAN_TOKEN_KIND);
      if (!presented) throw unauthorized();
      const row = repo.findTokenByHash(presented.hash);
      // Pencarian lewat indeks unik hash; pembandingan ulang dengan waktu konstan sebagai lapisan kedua.
      if (!row || !sameHash(row.tokenHash, presented.hash)) throw unauthorized();
      const at = now();
      if (row.revokedAt || row.expiresAt <= at) throw unauthorized();
      const userId = plans.ownerOf(row.planId);
      if (!userId) throw unauthorized();

      const count = repo.countUse(row.id, at, RATE_WINDOW_MS);
      if (count > RATE_MAX) {
        const started = row.windowStartedAt?.getTime() ?? at.getTime();
        const minutes = Math.max(
          1,
          Math.ceil((started + RATE_WINDOW_MS - at.getTime()) / 60_000),
        );
        throw new AppError(
          "VALIDATION",
          agentBridgeCopy.agent.rateLimited(minutes),
          HTTP_TOO_MANY_REQUESTS,
        );
      }
      return { token: row, planId: row.planId, userId };
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
