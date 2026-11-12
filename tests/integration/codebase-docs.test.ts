import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AgentService, createAgentService } from "@/features/codebase/server/agent";
import { createCodebaseRepo } from "@/features/codebase/server/repo";
import {
  type CodebaseService,
  createCodebaseService,
} from "@/features/codebase/server/service";
import { createSourceStore } from "@/features/codebase/server/source-store";
import { createUsageRepo } from "@/features/usage/server/repo";
import type { DbHandle } from "@/server/db/client";
import { usage } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createTestDb, seedUser } from "../helpers/test-db";

/** M7-14/M7-15/M7-16: edit manual, versi, pulihkan, usulan, ringkasan perubahan, ekspor ZIP. */

let handle: DbHandle;
let repo: ReturnType<typeof createCodebaseRepo>;
let codebases: CodebaseService;
let agent: AgentService;
let sourceDir: string;
let userId: string;
let otherId: string;

beforeEach(() => {
  handle = createTestDb();
  repo = createCodebaseRepo(handle.db);
  sourceDir = mkdtempSync(join(tmpdir(), "piard-docs-"));
  codebases = createCodebaseService(repo, {
    store: createSourceStore(sourceDir),
    maxUploadBytes: 1024 * 1024,
  });
  agent = createAgentService(repo, { own: codebases.own });
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
});
afterEach(() => {
  handle.close();
  rmSync(sourceDir, { recursive: true, force: true });
});

/** Codebase dengan dua halaman dari agen. */
function documented() {
  const { id } = codebases.create(userId, {
    name: "Toko Daring",
    source: "agent",
    language: "id",
  });
  const { token } = agent.createToken(userId, id);
  const submit = (pages: { slug: string; content: string }[]) =>
    agent.submit(
      agent.authenticate(`Bearer ${token}`),
      new TextEncoder().encode(JSON.stringify({ pages })),
    );
  submit([
    { slug: "ringkasan", content: "Versi agen 1" },
    { slug: "modul", content: "Modul agen 1" },
  ]);
  return { id, submit };
}

function rejects(run: () => unknown, code: string) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `diharapkan AppError ${code}`).toBeInstanceOf(AppError);
  expect((thrown as AppError).code).toBe(code);
}

describe("edit manual dan versi (M7-15)", () => {
  it("edit menjadi versi manual; isi sama tidak menambah versi; halaman ditandai diedit", () => {
    const { id } = documented();
    const saved = codebases.saveDoc(userId, id, "ringkasan", "Ditulis tangan");
    expect(saved.page).toMatchObject({ version: 2, origin: "manual", edited: true });
    expect(saved.versions.map((v) => [v.version, v.origin])).toEqual([
      [2, "manual"],
      [1, "agent"],
    ]);
    expect(
      codebases.saveDoc(userId, id, "ringkasan", "Ditulis tangan").page.version,
    ).toBe(2);
    // Halaman yang belum ada bisa ditulis manual juga.
    expect(codebases.saveDoc(userId, id, "data", "Tabel users").page).toMatchObject({
      version: 1,
      title: "Model data",
    });
    const list = codebases.listDocs(userId, id);
    expect(list.find((d) => d.slug === "ringkasan")?.edited).toBe(true);
    expect(list.find((d) => d.slug === "modul")?.edited).toBe(false);
  });

  it("pulihkan menyalin versi lama menjadi terbaru tanpa menghapus riwayat", () => {
    const { id } = documented();
    codebases.saveDoc(userId, id, "ringkasan", "Edit kedua");
    const restored = codebases.restoreDoc(userId, id, "ringkasan", 1);
    expect(restored.page).toMatchObject({
      version: 3,
      content: "Versi agen 1",
      origin: "manual",
    });
    expect(restored.versions).toHaveLength(3);
    rejects(() => codebases.restoreDoc(userId, id, "ringkasan", 9), "NOT_FOUND");
  });

  it("409 selama analisis; milik orang lain 404", () => {
    const { id } = documented();
    rejects(() => codebases.saveDoc(otherId, id, "ringkasan", "x"), "NOT_FOUND");
    repo.update(userId, id, { status: "analyzing" });
    rejects(() => codebases.saveDoc(userId, id, "ringkasan", "x"), "CONFLICT");
    rejects(() => codebases.restoreDoc(userId, id, "ringkasan", 1), "CONFLICT");
  });
});

describe("analisis ulang tanpa menimpa edit (M7-16)", () => {
  it("kiriman agen baru tidak menimpa halaman yang diedit manual: menjadi usulan", () => {
    const { id, submit } = documented();
    codebases.saveDoc(userId, id, "ringkasan", "Ditulis tangan");
    const result = submit([
      { slug: "ringkasan", content: "Versi agen 2" },
      { slug: "modul", content: "Modul agen 2" },
      { slug: "api", content: "API agen" },
    ]);
    expect(result.added).toEqual(["modul", "api"]);
    expect(result.proposed).toEqual(["ringkasan"]);

    const doc = codebases.getDoc(userId, id, "ringkasan");
    expect(doc.page).toMatchObject({
      content: "Ditulis tangan",
      origin: "manual",
      hasProposal: true,
    });
    expect(doc.proposal).toMatchObject({
      content: "Versi agen 2",
      origin: "agent",
      baseVersion: 2,
    });
    expect(codebases.get(userId, id).analysisSummary).toMatchObject({
      origin: "agent",
      added: ["api"],
      changed: ["modul"],
      unchanged: [],
      proposed: ["ringkasan"],
    });
  });

  it("terima usulan menjadi versi baru; tolak membuang usulan; tanpa usulan 404", () => {
    const { id, submit } = documented();
    codebases.saveDoc(userId, id, "ringkasan", "Ditulis tangan");
    submit([{ slug: "ringkasan", content: "Versi agen 2" }]);
    const accepted = codebases.resolveProposal(userId, id, "ringkasan", "accept");
    expect(accepted.page).toMatchObject({
      content: "Versi agen 2",
      origin: "agent",
      version: 3,
    });
    expect(accepted.proposal).toBeNull();

    codebases.saveDoc(userId, id, "ringkasan", "Edit lagi");
    submit([{ slug: "ringkasan", content: "Versi agen 3" }]);
    const rejected = codebases.resolveProposal(userId, id, "ringkasan", "reject");
    expect(rejected.page).toMatchObject({ content: "Edit lagi", origin: "manual" });
    expect(rejected.proposal).toBeNull();
    rejects(
      () => codebases.resolveProposal(userId, id, "ringkasan", "accept"),
      "NOT_FOUND",
    );
  });

  it("kiriman sama dengan edit manual tidak membuat usulan", () => {
    const { id, submit } = documented();
    codebases.saveDoc(userId, id, "ringkasan", "Sama persis");
    const result = submit([{ slug: "ringkasan", content: "Sama persis" }]);
    expect(result.proposed).toEqual([]);
    expect(codebases.get(userId, id).analysisSummary?.unchanged).toEqual(["ringkasan"]);
  });
});

describe("ekspor dokumentasi", () => {
  it("ZIP berisi NN-slug.md dengan judul, nama berkas dari nama proyek, deterministik", () => {
    const { id } = documented();
    const file = codebases.exportDocs(userId, id);
    expect(file.filename).toBe("toko-daring-docs.zip");
    const entries = unzipSync(file.body);
    expect(Object.keys(entries)).toEqual(["01-ringkasan.md", "05-modul.md"]);
    expect(strFromU8(entries["01-ringkasan.md"] ?? new Uint8Array())).toBe(
      "# Ringkasan\n\nVersi agen 1\n",
    );
    expect(codebases.exportDocs(userId, id).body).toEqual(file.body);
  });

  it("tanpa dokumentasi 404; milik orang lain 404", () => {
    const { id } = codebases.create(userId, {
      name: "Kosong",
      source: "zip",
      language: "id",
    });
    rejects(() => codebases.exportDocs(userId, id), "NOT_FOUND");
    const doc = documented();
    rejects(() => codebases.exportDocs(otherId, doc.id), "NOT_FOUND");
  });
});

describe("pemakaian satu run", () => {
  it("total per ref_id hanya milik pengguna, termasuk run tanpa plan", () => {
    const row = (owner: string, input: number, cost: number) => ({
      userId: owner,
      planId: null,
      kind: "codebase",
      refId: "job-1",
      model: "claude-haiku-5-5",
      inputTokens: input,
      outputTokens: 10,
      costUsd: cost,
    });
    handle.db
      .insert(usage)
      .values([row(userId, 100, 0.01), row(userId, 50, 0.02), row(otherId, 999, 9)])
      .run();
    const totals = createUsageRepo(handle.db).runTotals(userId, "job-1");
    expect(totals.calls).toBe(2);
    expect(totals.inputTokens).toBe(150);
    expect(totals.costUsd).toBeCloseTo(0.03);
    expect(createUsageRepo(handle.db).runTotals(userId, "tidak-ada")).toMatchObject({
      calls: 0,
    });
  });
});
