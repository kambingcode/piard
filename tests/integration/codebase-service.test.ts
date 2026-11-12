import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCodebaseRepo } from "@/features/codebase/server/repo";
import {
  type CodebaseService,
  createCodebaseService,
} from "@/features/codebase/server/service";
import { createSourceStore } from "@/features/codebase/server/source-store";
import type { DbHandle } from "@/server/db/client";
import { codebases, workspaces } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createTestDb, seedUser } from "../helpers/test-db";

let handle: DbHandle;
let service: CodebaseService;
let repo: ReturnType<typeof createCodebaseRepo>;
let userId: string;
let otherId: string;

let sourceDir: string;

beforeEach(() => {
  handle = createTestDb();
  repo = createCodebaseRepo(handle.db);
  sourceDir = mkdtempSync(join(tmpdir(), "piard-src-"));
  service = createCodebaseService(repo, {
    store: createSourceStore(sourceDir),
    maxUploadBytes: 1024 * 1024,
  });
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
});
afterEach(() => {
  handle.close();
  rmSync(sourceDir, { recursive: true, force: true });
});

function expectAppError(run: () => unknown, code: string, message?: string) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `diharapkan AppError ${code}`).toBeInstanceOf(AppError);
  expect((thrown as AppError).code).toBe(code);
  if (message !== undefined) expect((thrown as AppError).message).toBe(message);
}

const create = (name = "Toko Online") =>
  service.create(userId, { name, source: "zip", language: "id" });

describe("create, list, get", () => {
  it("membuat codebase di workspace bawaan tanpa sumber", () => {
    const codebase = create();
    expect(codebase).toMatchObject({
      name: "Toko Online",
      source: "zip",
      language: "id",
      status: "awaiting_source",
      manifest: null,
      sourceRef: null,
      detectedStack: { languages: [], tools: [] },
    });
    const ws = handle.db.select().from(workspaces).all();
    expect(ws).toHaveLength(1);
    expect(ws[0]?.name).toBe("Pribadi");

    // Codebase kedua memakai workspace yang sama.
    create("Kedua");
    expect(handle.db.select().from(workspaces).all()).toHaveLength(1);
  });

  it("daftar hanya berisi milik pengguna, terbaru dulu", () => {
    const older = create("Lama");
    const newer = create("Baru");
    service.create(otherId, { name: "Milik lain", source: "agent", language: "en" });
    // updatedAt ditetapkan agar urutan tidak bergantung pada kecepatan tes.
    const at = (id: string, ms: number) =>
      handle.db
        .update(codebases)
        .set({ updatedAt: new Date(ms) })
        .where(eq(codebases.id, id))
        .run();
    at(older.id, 1_000);
    at(newer.id, 2_000);
    expect(service.list(userId).map((c) => c.name)).toEqual(["Baru", "Lama"]);
    at(older.id, 3_000);
    expect(service.list(userId).map((c) => c.name)).toEqual(["Lama", "Baru"]);
    expect(service.list(otherId).map((c) => c.name)).toEqual(["Milik lain"]);
  });

  it("milik orang lain diperlakukan seperti tidak ada (404)", () => {
    const codebase = create();
    expectAppError(() => service.get(otherId, codebase.id), "NOT_FOUND");
    expectAppError(
      () => service.rename(otherId, codebase.id, { name: "x" }),
      "NOT_FOUND",
    );
    expectAppError(() => service.delete(otherId, codebase.id), "NOT_FOUND");
    expectAppError(() => service.listDocs(otherId, codebase.id), "NOT_FOUND");
    expectAppError(() => service.getDoc(otherId, codebase.id, "ringkasan"), "NOT_FOUND");
    expect(service.get(userId, codebase.id).name).toBe("Toko Online");
  });

  it("ringkasan manifes tidak membawa daftar berkas", () => {
    const codebase = create();
    repo.update(userId, codebase.id, {
      manifest: {
        files: [{ path: "a.ts", size: 3, language: "TypeScript", key: null }],
        totalFiles: 1,
        totalBytes: 3,
        skipped: { binary: 2 },
        redactions: 0,
        redactedFiles: 0,
        languages: { TypeScript: 3 },
      },
    });
    const manifest = service.get(userId, codebase.id).manifest;
    expect(manifest).toEqual({
      totalFiles: 1,
      totalBytes: 3,
      skipped: { binary: 2 },
      redactions: 0,
      redactedFiles: 0,
      languages: { TypeScript: 3 },
    });
    expect(manifest).not.toHaveProperty("files");
  });
});

describe("rename dan delete", () => {
  it("mengganti nama dan menghapus", () => {
    const codebase = create();
    expect(service.rename(userId, codebase.id, { name: "Baru" }).name).toBe("Baru");
    service.delete(userId, codebase.id);
    expectAppError(() => service.get(userId, codebase.id), "NOT_FOUND");
    expectAppError(() => service.delete(userId, codebase.id), "NOT_FOUND");
  });
});

describe("dokumentasi", () => {
  const page = (
    slug: string,
    content: string,
    origin: "agent" | "ai" | "manual" = "ai",
  ) => ({
    slug,
    title: slug,
    content,
    origin,
  });

  it("menyimpan versi berikutnya dan melewati isi yang sama", () => {
    const { id } = create();
    expect(
      repo.addDocVersions(id, [page("ringkasan", "v1"), page("modul", "m1")]),
    ).toEqual(["ringkasan", "modul"]);
    expect(repo.addDocVersions(id, [page("ringkasan", "v1")])).toEqual([]);
    expect(repo.addDocVersions(id, [page("ringkasan", "v2", "manual")])).toEqual([
      "ringkasan",
    ]);

    const { page: latest, versions } = service.getDoc(userId, id, "ringkasan");
    expect(latest).toMatchObject({
      slug: "ringkasan",
      version: 2,
      content: "v2",
      origin: "manual",
    });
    expect(versions.map((v) => [v.version, v.origin])).toEqual([
      [2, "manual"],
      [1, "ai"],
    ]);
    expect(service.getDoc(userId, id, "ringkasan", 1).page.content).toBe("v1");
  });

  it("daftar halaman memakai versi terbaru dan urutan standar", () => {
    const { id } = create();
    repo.addDocVersions(id, [
      page("catatan", "c"),
      page("arsitektur", "a1"),
      page("ringkasan", "r"),
    ]);
    repo.addDocVersions(id, [page("arsitektur", "a2")]);
    const pages = service.listDocs(userId, id);
    expect(pages.map((p) => [p.slug, p.version])).toEqual([
      ["ringkasan", 1],
      ["arsitektur", 2],
      ["catatan", 1],
    ]);
    expect(pages[0]).not.toHaveProperty("content");
  });

  it("halaman atau versi yang belum ada dijawab 404 dengan pesan berbeda", () => {
    const { id } = create();
    repo.addDocVersions(id, [page("ringkasan", "r")]);
    expectAppError(
      () => service.getDoc(userId, id, "modul"),
      "NOT_FOUND",
      "Halaman dokumentasi ini belum ada.",
    );
    expectAppError(
      () => service.getDoc(userId, id, "ringkasan", 9),
      "NOT_FOUND",
      "Versi halaman ini tidak ditemukan.",
    );
  });

  it("dokumentasi satu codebase tidak terlihat dari codebase lain", () => {
    const a = create("A");
    const b = create("B");
    repo.addDocVersions(a.id, [page("ringkasan", "milik A")]);
    expect(service.listDocs(userId, b.id)).toEqual([]);
    expectAppError(() => service.getDoc(userId, b.id, "ringkasan"), "NOT_FOUND");
  });
});
