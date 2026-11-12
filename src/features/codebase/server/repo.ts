import "server-only";

import { and, count, countDistinct, desc, eq, isNull, max } from "drizzle-orm";
import { type Db, getDb } from "@/server/db/client";
import {
  agentTokens,
  codebaseDocProposals,
  codebaseDocs,
  codebases,
  plans,
} from "@/server/db/schema";
import { ensureDefaultWorkspace } from "@/server/db/workspaces";

export type CodebaseRow = typeof codebases.$inferSelect;
export type CodebaseDocRow = typeof codebaseDocs.$inferSelect;
export type AgentTokenRow = typeof agentTokens.$inferSelect;
export type DocProposalRow = typeof codebaseDocProposals.$inferSelect;
export type CodebaseUpdate = Partial<
  Pick<
    typeof codebases.$inferInsert,
    | "name"
    | "sourceRef"
    | "status"
    | "error"
    | "detectedStack"
    | "manifest"
    | "sourceReceivedAt"
    | "analyzedAt"
    | "analysisJobId"
    | "analysisSummary"
  >
>;

/** Halaman baru yang akan disimpan sebagai versi berikutnya. */
export type NewDocVersion = Pick<
  typeof codebaseDocs.$inferInsert,
  "slug" | "title" | "content" | "origin"
>;

/**
 * Satu-satunya tempat yang tahu tabel `codebases`, `codebase_docs`, `codebase_doc_proposals`, dan
 * `agent_tokens`.
 */
export function createCodebaseRepo(db: Db) {
  return {
    defaultWorkspace(userId: string): { id: string; name: string } {
      return ensureDefaultWorkspace(db, userId);
    },

    insert(input: typeof codebases.$inferInsert): CodebaseRow {
      return db.insert(codebases).values(input).returning().get();
    },

    /** Codebase milik `userId`; milik orang lain diperlakukan seperti tidak ada. */
    find(userId: string, id: string): CodebaseRow | undefined {
      return db
        .select()
        .from(codebases)
        .where(and(eq(codebases.id, id), eq(codebases.userId, userId)))
        .get();
    },

    /**
     * Codebase menurut id saja, **tanpa** filter pengguna. Hanya untuk jalur agen, yang kepemilikannya
     * sudah dibuktikan oleh token (token terikat ke satu codebase).
     */
    findById(id: string): CodebaseRow | undefined {
      return db.select().from(codebases).where(eq(codebases.id, id)).get();
    },

    list(userId: string): CodebaseRow[] {
      return db
        .select()
        .from(codebases)
        .where(eq(codebases.userId, userId))
        .orderBy(desc(codebases.updatedAt))
        .all();
    },

    /** Jumlah halaman (slug berbeda) per codebase milik pengguna, untuk daftar proyek. */
    docCounts(userId: string): Map<string, number> {
      const rows = db
        .select({ id: codebaseDocs.codebaseId, pages: countDistinct(codebaseDocs.slug) })
        .from(codebaseDocs)
        .innerJoin(codebases, eq(codebases.id, codebaseDocs.codebaseId))
        .where(eq(codebases.userId, userId))
        .groupBy(codebaseDocs.codebaseId)
        .all();
      return new Map(rows.map((row) => [row.id, row.pages]));
    },

    update(userId: string, id: string, patch: CodebaseUpdate): boolean {
      const result = db
        .update(codebases)
        .set(patch)
        .where(and(eq(codebases.id, id), eq(codebases.userId, userId)))
        .run();
      return result.changes > 0;
    },

    /**
     * Menghapus codebase → jumlah plan tertaut yang dipertahankan (FK `set null`), atau null bila tidak
     * ada yang terhapus. Dihitung di transaksi yang sama agar angkanya tepat untuk pesan ke pengguna.
     */
    delete(userId: string, id: string): { keptPlans: number } | null {
      return db.transaction((tx) => {
        const keptPlans =
          tx
            .select({ total: count() })
            .from(plans)
            .where(and(eq(plans.codebaseId, id), eq(plans.userId, userId)))
            .get()?.total ?? 0;
        const result = tx
          .delete(codebases)
          .where(and(eq(codebases.id, id), eq(codebases.userId, userId)))
          .run();
        return result.changes > 0 ? { keptPlans } : null;
      });
    },

    /** Token baru untuk codebase; token aktif lain dicabut dalam transaksi yang sama (satu aktif). */
    replaceAgentToken(
      codebaseId: string,
      tokenHash: string,
      expiresAt: Date,
      now: Date,
    ): AgentTokenRow {
      return db.transaction((tx) => {
        tx.update(agentTokens)
          .set({ revokedAt: now })
          .where(
            and(eq(agentTokens.codebaseId, codebaseId), isNull(agentTokens.revokedAt)),
          )
          .run();
        return tx
          .insert(agentTokens)
          .values({ codebaseId, tokenHash, expiresAt })
          .returning()
          .get();
      });
    },

    /** @returns jumlah token aktif yang dicabut. */
    revokeAgentTokens(codebaseId: string, now: Date): number {
      return db
        .update(agentTokens)
        .set({ revokedAt: now })
        .where(and(eq(agentTokens.codebaseId, codebaseId), isNull(agentTokens.revokedAt)))
        .run().changes;
    },

    /** Token belum dicabut dan belum kedaluwarsa untuk codebase, bila ada (untuk ditampilkan statusnya). */
    activeAgentToken(codebaseId: string, now: Date): AgentTokenRow | undefined {
      const row = db
        .select()
        .from(agentTokens)
        .where(and(eq(agentTokens.codebaseId, codebaseId), isNull(agentTokens.revokedAt)))
        .orderBy(desc(agentTokens.createdAt))
        .limit(1)
        .get();
      return row && row.expiresAt > now ? row : undefined;
    },

    findAgentTokenByHash(tokenHash: string): AgentTokenRow | undefined {
      return db
        .select()
        .from(agentTokens)
        .where(eq(agentTokens.tokenHash, tokenHash))
        .get();
    },

    /**
     * Mencatat satu permintaan untuk batas laju jendela tetap: jendela baru dimulai bila yang lama sudah
     * lewat. Disimpan di database, bukan memori, karena Next memuat modul server lebih dari sekali.
     *
     * @returns jumlah permintaan di jendela saat ini, termasuk yang ini.
     */
    countAgentTokenUse(id: string, now: Date, windowMs: number): number {
      return db.transaction((tx) => {
        const row = tx.select().from(agentTokens).where(eq(agentTokens.id, id)).get();
        if (!row) return 0;
        const fresh =
          !row.windowStartedAt ||
          now.getTime() - row.windowStartedAt.getTime() >= windowMs;
        const count = fresh ? 1 : row.windowCount + 1;
        tx.update(agentTokens)
          .set({
            windowStartedAt: fresh ? now : row.windowStartedAt,
            windowCount: count,
            lastUsedAt: now,
          })
          .where(eq(agentTokens.id, id))
          .run();
        return count;
      });
    },

    /** Usulan untuk halaman (satu per halaman); usulan baru menggantikan yang lama. */
    upsertProposal(
      input: Pick<
        typeof codebaseDocProposals.$inferInsert,
        "codebaseId" | "slug" | "content" | "origin" | "baseVersion"
      >,
    ): void {
      db.insert(codebaseDocProposals)
        .values(input)
        .onConflictDoUpdate({
          target: [codebaseDocProposals.codebaseId, codebaseDocProposals.slug],
          set: {
            content: input.content,
            origin: input.origin,
            baseVersion: input.baseVersion,
            createdAt: new Date(),
          },
        })
        .run();
    },

    listProposals(codebaseId: string): DocProposalRow[] {
      return db
        .select()
        .from(codebaseDocProposals)
        .where(eq(codebaseDocProposals.codebaseId, codebaseId))
        .all();
    },

    findProposal(codebaseId: string, slug: string): DocProposalRow | undefined {
      return db
        .select()
        .from(codebaseDocProposals)
        .where(
          and(
            eq(codebaseDocProposals.codebaseId, codebaseId),
            eq(codebaseDocProposals.slug, slug),
          ),
        )
        .get();
    },

    /** @returns true bila ada usulan yang dihapus. */
    deleteProposal(codebaseId: string, slug: string): boolean {
      return (
        db
          .delete(codebaseDocProposals)
          .where(
            and(
              eq(codebaseDocProposals.codebaseId, codebaseId),
              eq(codebaseDocProposals.slug, slug),
            ),
          )
          .run().changes > 0
      );
    },

    /** Halaman yang pernah punya versi `manual` (ditandai di penampil, M7-16). */
    manuallyEditedSlugs(codebaseId: string): string[] {
      return db
        .selectDistinct({ slug: codebaseDocs.slug })
        .from(codebaseDocs)
        .where(
          and(eq(codebaseDocs.codebaseId, codebaseId), eq(codebaseDocs.origin, "manual")),
        )
        .all()
        .map((row) => row.slug);
    },

    /** Versi terbaru tiap halaman (urutan bebas; service mengurutkan sesuai halaman standar). */
    latestDocs(codebaseId: string): CodebaseDocRow[] {
      const latest = db
        .select({
          slug: codebaseDocs.slug,
          // Alias tidak boleh `version`: SQLite menganggapnya ambigu dengan kolom tabel di join luar.
          maxVersion: max(codebaseDocs.version).as("max_version"),
        })
        .from(codebaseDocs)
        .where(eq(codebaseDocs.codebaseId, codebaseId))
        .groupBy(codebaseDocs.slug)
        .as("latest");
      return db
        .select({ doc: codebaseDocs })
        .from(codebaseDocs)
        .innerJoin(
          latest,
          and(
            eq(codebaseDocs.slug, latest.slug),
            eq(codebaseDocs.version, latest.maxVersion),
          ),
        )
        .where(eq(codebaseDocs.codebaseId, codebaseId))
        .all()
        .map((row) => row.doc);
    },

    /** Satu versi halaman; tanpa `version` = versi terbaru. */
    findDoc(
      codebaseId: string,
      slug: string,
      version?: number,
    ): CodebaseDocRow | undefined {
      return db
        .select()
        .from(codebaseDocs)
        .where(
          and(
            eq(codebaseDocs.codebaseId, codebaseId),
            eq(codebaseDocs.slug, slug),
            version === undefined ? undefined : eq(codebaseDocs.version, version),
          ),
        )
        .orderBy(desc(codebaseDocs.version))
        .limit(1)
        .get();
    },

    /** Riwayat satu halaman, terbaru dulu, tanpa isi. */
    docVersions(codebaseId: string, slug: string) {
      return db
        .select({
          version: codebaseDocs.version,
          origin: codebaseDocs.origin,
          createdAt: codebaseDocs.createdAt,
        })
        .from(codebaseDocs)
        .where(and(eq(codebaseDocs.codebaseId, codebaseId), eq(codebaseDocs.slug, slug)))
        .orderBy(desc(codebaseDocs.version))
        .all();
    },

    /**
     * Menyimpan halaman sebagai versi berikutnya masing-masing dalam satu transaksi. Halaman yang isinya
     * sama persis dengan versi terbarunya dilewati (simpan ulang tanpa perubahan tidak menambah versi).
     *
     * @returns slug halaman yang benar-benar mendapat versi baru.
     */
    addDocVersions(codebaseId: string, pages: NewDocVersion[]): string[] {
      return db.transaction((tx) => {
        const added: string[] = [];
        for (const page of pages) {
          const latest = tx
            .select({ version: codebaseDocs.version, content: codebaseDocs.content })
            .from(codebaseDocs)
            .where(
              and(
                eq(codebaseDocs.codebaseId, codebaseId),
                eq(codebaseDocs.slug, page.slug),
              ),
            )
            .orderBy(desc(codebaseDocs.version))
            .limit(1)
            .get();
          if (latest?.content === page.content) continue;
          tx.insert(codebaseDocs)
            .values({ ...page, codebaseId, version: (latest?.version ?? 0) + 1 })
            .run();
          added.push(page.slug);
        }
        // Menyentuh codebase agar daftar proyek terurut menurut perubahan terakhir.
        if (added.length > 0) {
          tx.update(codebases)
            .set({ updatedAt: new Date() })
            .where(eq(codebases.id, codebaseId))
            .run();
        }
        return added;
      });
    },
  };
}

export type CodebaseRepo = ReturnType<typeof createCodebaseRepo>;

/** Repo untuk database proses ini. */
export const getCodebaseRepo = (): CodebaseRepo => createCodebaseRepo(getDb());
