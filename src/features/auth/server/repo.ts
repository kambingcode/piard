import "server-only";

import { count, eq, lt } from "drizzle-orm";
import { type Db, getDb } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import type { AuthUser } from "../types";

export type UserRow = AuthUser & { passwordHash: string };

const toAuthUser = ({ id, email, name }: AuthUser): AuthUser => ({ id, email, name });

/** Satu-satunya tempat di fitur auth yang tahu tabel `users` dan `sessions`. */
export function createAuthRepo(db: Db) {
  return {
    countUsers(): number {
      return db.select({ total: count() }).from(users).get()?.total ?? 0;
    },

    findUserByEmail(email: string): UserRow | undefined {
      return db.select().from(users).where(eq(users.email, email)).get();
    },

    /**
     * Membuat pengguna hanya bila belum ada pengguna sama sekali. Pengecekan dan penyisipan
     * satu transaksi, jadi dua pendaftaran serentak tidak bisa sama-sama lolos.
     */
    createFirstUser(input: {
      email: string;
      name: string;
      passwordHash: string;
    }): AuthUser | undefined {
      return db.transaction((tx) => {
        const existing = tx.select({ total: count() }).from(users).get()?.total ?? 0;
        if (existing > 0) return undefined;
        return toAuthUser(tx.insert(users).values(input).returning().get());
      });
    },

    insertSession(input: { id: string; userId: string; expiresAt: Date }): void {
      db.insert(sessions).values(input).run();
    },

    /** Pengguna pemilik sesi `id` (hash token) yang belum kedaluwarsa pada `now`. */
    findSessionUser(id: string, now: Date): AuthUser | undefined {
      const row = db
        .select({ user: users, expiresAt: sessions.expiresAt })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, id))
        .get();
      if (!row || row.expiresAt.getTime() <= now.getTime()) return undefined;
      return toAuthUser(row.user);
    },

    deleteSession(id: string): void {
      db.delete(sessions).where(eq(sessions.id, id)).run();
    },

    deleteExpiredSessions(now: Date): void {
      db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
    },
  };
}

export type AuthRepo = ReturnType<typeof createAuthRepo>;

/** Repo untuk database proses ini. */
export const getAuthRepo = (): AuthRepo => createAuthRepo(getDb());
