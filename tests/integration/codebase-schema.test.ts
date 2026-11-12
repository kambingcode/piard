import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  type DbHandle,
  MIGRATIONS_FOLDER,
  runMigrations,
} from "@/server/db/client";
import {
  agentTokens,
  codebaseDocs,
  codebases,
  plans,
  workspaces,
} from "@/server/db/schema";
import { createTestDb, seedUser } from "../helpers/test-db";

/** Tabel proyek eksisting (M7-02, ADR 0016): kunci asing, keunikan versi, dan migrasi di DB berisi. */

let handle: DbHandle;

beforeEach(() => {
  handle = createTestDb();
});
afterEach(() => handle.close());

function seed(db: DbHandle["db"]) {
  const user = seedUser(db);
  const workspace = db
    .insert(workspaces)
    .values({ userId: user.id, name: "Pribadi" })
    .returning()
    .get();
  const codebase = db
    .insert(codebases)
    .values({ userId: user.id, workspaceId: workspace.id, name: "Toko", source: "zip" })
    .returning()
    .get();
  const plan = db
    .insert(plans)
    .values({
      userId: user.id,
      workspaceId: workspace.id,
      idea: "Tambah fitur ulasan",
      codebaseId: codebase.id,
    })
    .returning()
    .get();
  return { user, workspace, codebase, plan };
}

describe("tabel codebase", () => {
  it("memberi nilai bawaan yang aman untuk codebase baru", () => {
    const { codebase } = seed(handle.db);
    expect(codebase.status).toBe("awaiting_source");
    expect(codebase.language).toBe("id");
    expect(codebase.detectedStack).toEqual({ languages: [], tools: [] });
    expect(codebase.manifest).toBeNull();
    expect(codebase.sourceRef).toBeNull();
  });

  it("menghapus codebase mengosongkan plans.codebase_id, bukan menghapus plan", () => {
    const { codebase, plan } = seed(handle.db);
    handle.db.delete(codebases).where(eq(codebases.id, codebase.id)).run();

    const after = handle.db.select().from(plans).where(eq(plans.id, plan.id)).get();
    expect(after).toBeDefined();
    expect(after?.codebaseId).toBeNull();
  });

  it("menghapus codebase ikut menghapus dokumentasi dan token agennya", () => {
    const { codebase } = seed(handle.db);
    handle.db
      .insert(codebaseDocs)
      .values({
        codebaseId: codebase.id,
        slug: "ringkasan",
        title: "Ringkasan",
        content: "# Toko",
        origin: "ai",
      })
      .run();
    handle.db
      .insert(agentTokens)
      .values({ codebaseId: codebase.id, tokenHash: "h1", expiresAt: new Date() })
      .run();

    handle.db.delete(codebases).where(eq(codebases.id, codebase.id)).run();
    expect(handle.db.select().from(codebaseDocs).all()).toEqual([]);
    expect(handle.db.select().from(agentTokens).all()).toEqual([]);
  });

  it("menolak versi halaman ganda dan hash token ganda", () => {
    const { codebase } = seed(handle.db);
    const page = {
      codebaseId: codebase.id,
      slug: "modul",
      title: "Modul",
      content: "a",
      version: 1,
      origin: "agent" as const,
    };
    handle.db.insert(codebaseDocs).values(page).run();
    expect(() => handle.db.insert(codebaseDocs).values(page).run()).toThrow();

    const token = { codebaseId: codebase.id, tokenHash: "sama", expiresAt: new Date() };
    handle.db.insert(agentTokens).values(token).run();
    expect(() => handle.db.insert(agentTokens).values(token).run()).toThrow();
  });
});

describe("migrasi 0002 di database yang sudah berisi", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Folder migrasi berisi hanya `count` migrasi pertama, seperti database sebelum M7. */
  function partialMigrations(count: number): string {
    const folder = join(dir, "drizzle");
    mkdirSync(join(folder, "meta"), { recursive: true });
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string }[] };
    const entries = journal.entries.slice(0, count);
    for (const entry of entries) {
      copyFileSync(
        join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
        join(folder, `${entry.tag}.sql`),
      );
    }
    writeFileSync(
      join(folder, "meta", "_journal.json"),
      JSON.stringify({ ...journal, entries }),
    );
    return folder;
  }

  it("menambah tabel dan kolom tanpa mengubah plan lama", () => {
    dir = mkdtempSync(join(tmpdir(), "piard-mig-"));
    const old = createDb(join(dir, "lama.db"));
    runMigrations(old.db, partialMigrations(2));
    expect(readdirSync(join(dir, "drizzle"))).not.toContain("0002_outstanding_ulik.sql");

    const user = seedUser(old.db);
    const ws = old.sqlite
      .prepare(
        "INSERT INTO workspaces (id, user_id, name, created_at) VALUES (?, ?, ?, ?) RETURNING id",
      )
      .get("w1", user.id, "Pribadi", Date.now()) as { id: string };
    old.sqlite
      .prepare(
        "INSERT INTO plans (id, user_id, workspace_id, idea, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("p1", user.id, ws.id, "Ide lama", Date.now(), Date.now());

    runMigrations(old.db);

    const plan = old.db.select().from(plans).where(eq(plans.id, "p1")).get();
    expect(plan?.idea).toBe("Ide lama");
    expect(plan?.codebaseId).toBeNull();
    expect(old.db.select().from(codebases).all()).toEqual([]);
    old.close();
  });
});
