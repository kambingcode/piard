import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCodebaseRepo } from "@/features/codebase/server/repo";
import {
  type CodebaseService,
  createCodebaseService,
  sanitizeFileName,
} from "@/features/codebase/server/service";
import {
  createSourceStore,
  type SourceStore,
} from "@/features/codebase/server/source-store";
import type { DbHandle } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { createTestDb, seedUser } from "../helpers/test-db";

/** M7-05: menerima ZIP lewat service (pengekstrak, pemindai, sensor, penyimpanan sementara). */

let handle: DbHandle;
let service: CodebaseService;
let repo: ReturnType<typeof createCodebaseRepo>;
let store: SourceStore;
let sourceDir: string;
let userId: string;
let otherId: string;

const fakeKey = `sk${"-ant-"}api03-${"abcdefghijklmnopqrstu"}`;

beforeEach(() => {
  handle = createTestDb();
  repo = createCodebaseRepo(handle.db);
  sourceDir = mkdtempSync(join(tmpdir(), "piard-upload-"));
  store = createSourceStore(sourceDir);
  service = createCodebaseService(repo, { store, maxUploadBytes: 1024 * 1024 });
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
});
afterEach(() => {
  handle.close();
  rmSync(sourceDir, { recursive: true, force: true });
});

function expectAppError(run: () => unknown, code: string, message?: string | RegExp) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `diharapkan AppError ${code}`).toBeInstanceOf(AppError);
  expect((thrown as AppError).code).toBe(code);
  if (typeof message === "string") expect((thrown as AppError).message).toBe(message);
  if (message instanceof RegExp) expect((thrown as AppError).message).toMatch(message);
}

const zipCodebase = () =>
  service.create(userId, { name: "Toko", source: "zip", language: "id" });

const projectZip = () =>
  zipSync({
    "toko-main/README.md": strToU8("# Toko\nAplikasi toko."),
    "toko-main/package.json": strToU8(
      JSON.stringify({ dependencies: { next: "16", react: "19", pg: "8" } }),
    ),
    "toko-main/src/app/page.tsx": strToU8(
      "export default function Page() { return null }",
    ),
    "toko-main/.env": strToU8(`ANTHROPIC_API_KEY=${fakeKey}\nPORT=3000`),
    "toko-main/node_modules/next/index.js": strToU8("module.exports = {}"),
    "toko-main/public/logo.png": new Uint8Array([137, 80, 78, 71]),
  });

describe("receiveZip", () => {
  it("menyimpan manifes, teknologi, dan sumber tersensor; status source_ready", () => {
    const { id } = zipCodebase();
    const codebase = service.receiveZip(
      userId,
      id,
      projectZip(),
      encodeURIComponent("toko v2.zip"),
    );

    expect(codebase).toMatchObject({
      status: "source_ready",
      error: null,
      sourceRef: "toko v2.zip",
      detectedStack: { frontend: "Next.js", database: "PostgreSQL" },
      manifest: {
        totalFiles: 4,
        skipped: { ignored_dir: 1, binary: 1 },
        redactedFiles: 1,
      },
    });
    expect(codebase.sourceReceivedAt).not.toBeNull();

    const files = store.load(id);
    expect(files?.map((f) => f.path)).toEqual([
      ".env",
      "README.md",
      "package.json",
      "src/app/page.tsx",
    ]);
    // Rahasia tidak pernah sampai ke disk, baik di sumber sementara maupun di database.
    const onDisk = readdirSync(sourceDir).map((name) =>
      readFileSync(join(sourceDir, name), "utf8"),
    );
    expect(onDisk.join("")).not.toContain(fakeKey);
    expect(JSON.stringify(repo.find(userId, id))).not.toContain(fakeKey);
  });

  it("upload ulang mengganti sumber dan manifes", () => {
    const { id } = zipCodebase();
    service.receiveZip(userId, id, projectZip(), null);
    const second = service.receiveZip(
      userId,
      id,
      zipSync({ "main.py": strToU8("print(1)") }),
      "kedua.zip",
    );
    expect(second.manifest?.totalFiles).toBe(1);
    expect(second.sourceRef).toBe("kedua.zip");
    expect(store.load(id)?.map((f) => f.path)).toEqual(["main.py"]);
  });

  it("memetakan arsip yang ditolak ke pesan jelas tanpa mengubah status", () => {
    const { id } = zipCodebase();
    expectAppError(
      () => service.receiveZip(userId, id, strToU8("bukan zip"), null),
      "VALIDATION",
      /bukan ZIP/,
    );
    expectAppError(
      () => service.receiveZip(userId, id, zipSync({ "../x.ts": strToU8("a") }), null),
      "VALIDATION",
      /tidak aman \(segmen \.\.\)/,
    );
    expectAppError(
      () => service.receiveZip(userId, id, zipSync({}), null),
      "VALIDATION",
      "ZIP ini kosong.",
    );
    expectAppError(
      () =>
        service.receiveZip(
          userId,
          id,
          zipSync({ "node_modules/a.js": strToU8("x"), "logo.png": new Uint8Array([1]) }),
          null,
        ),
      "VALIDATION",
      /Tidak ada berkas kode/,
    );
    expect(service.get(userId, id).status).toBe("awaiting_source");
    expect(store.load(id)).toBeNull();
  });

  it("menolak sumber yang salah, analisis yang sedang berjalan, dan milik orang lain", () => {
    const agent = service.create(userId, {
      name: "Agen",
      source: "agent",
      language: "id",
    });
    expectAppError(
      () => service.receiveZip(userId, agent.id, projectZip(), null),
      "VALIDATION",
      /Prompt agen/,
    );

    const { id } = zipCodebase();
    repo.update(userId, id, { status: "analyzing" });
    expectAppError(() => service.receiveZip(userId, id, projectZip(), null), "CONFLICT");

    const mine = zipCodebase();
    expectAppError(
      () => service.receiveZip(otherId, mine.id, projectZip(), null),
      "NOT_FOUND",
    );
  });

  it("menghapus codebase ikut menghapus sumber sementaranya", () => {
    const { id } = zipCodebase();
    service.receiveZip(userId, id, projectZip(), null);
    expect(store.load(id)).not.toBeNull();
    service.delete(userId, id);
    expect(store.load(id)).toBeNull();
    expect(readdirSync(sourceDir)).toEqual([]);
  });
});

describe("uploadLimit dan sanitizeFileName", () => {
  it("menyebut batas dalam MB", () => {
    expect(service.uploadLimit()).toEqual({
      bytes: 1024 * 1024,
      messages: {
        tooLarge: expect.stringContaining("1 MB"),
        empty: expect.stringContaining("Pilih berkas .zip"),
      },
    });
  });

  it("hanya nama dasar tanpa karakter kontrol", () => {
    expect(sanitizeFileName(null)).toBe("proyek.zip");
    expect(sanitizeFileName("")).toBe("proyek.zip");
    expect(sanitizeFileName(encodeURIComponent("../../rahasia/toko.zip"))).toBe(
      "toko.zip",
    );
    expect(sanitizeFileName("C:\\Users\\a\\toko.zip")).toBe("toko.zip");
    expect(sanitizeFileName(encodeURIComponent("to\u0000ko\n.zip"))).toBe("toko.zip");
    expect(sanitizeFileName("%E0%A4%A")).toBe("%E0%A4%A");
    expect(sanitizeFileName("a".repeat(300))).toHaveLength(120);
  });
});
