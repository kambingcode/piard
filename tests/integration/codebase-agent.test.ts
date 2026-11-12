import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_RATE_MAX } from "@/features/codebase/limits";
import { type AgentService, createAgentService } from "@/features/codebase/server/agent";
import { createCodebaseRepo } from "@/features/codebase/server/repo";
import {
  type CodebaseService,
  createCodebaseService,
} from "@/features/codebase/server/service";
import { createSourceStore } from "@/features/codebase/server/source-store";
import type { DbHandle } from "@/server/db/client";
import { agentTokens } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createTestDb, seedUser } from "../helpers/test-db";

/** M7-07: token agen (hash saja, 24 jam, satu aktif, cabut) dan penerimaan halaman dari agen. */

const HOUR = 60 * 60 * 1000;
const fakeKey = `sk${"-ant-"}api03-${"abcdefghijklmnopqrstu"}`;

let handle: DbHandle;
let repo: ReturnType<typeof createCodebaseRepo>;
let codebases: CodebaseService;
let agent: AgentService;
let sourceDir: string;
let clock: number;
let userId: string;
let otherId: string;

beforeEach(() => {
  handle = createTestDb();
  repo = createCodebaseRepo(handle.db);
  sourceDir = mkdtempSync(join(tmpdir(), "piard-agent-"));
  clock = Date.parse("2026-10-30T10:00:00Z");
  const now = () => new Date(clock);
  codebases = createCodebaseService(repo, {
    store: createSourceStore(sourceDir),
    maxUploadBytes: 1024 * 1024,
    now,
  });
  agent = createAgentService(repo, { now, own: codebases.own });
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
});
afterEach(() => {
  handle.close();
  rmSync(sourceDir, { recursive: true, force: true });
});

const agentCodebase = (language: "id" | "en" = "id") =>
  codebases.create(userId, { name: "Toko", source: "agent", language });

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const bearer = (token: string) => `Bearer ${token}`;

function rejects(run: () => unknown, code: string, status?: number): AppError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `diharapkan AppError ${code}`).toBeInstanceOf(AppError);
  const error = thrown as AppError;
  expect(error.code).toBe(code);
  if (status) expect(error.status).toBe(status);
  return error;
}

describe("token agen", () => {
  it("dibuat acak berawalan pcb_, hanya hash yang disimpan, berlaku 24 jam", () => {
    const { id } = agentCodebase();
    const first = agent.createToken(userId, id);
    expect(first.token).toMatch(/^pcb_[A-Za-z0-9_-]{43}$/);
    expect(first.expiresAt).toBe(new Date(clock + 24 * HOUR).toISOString());

    const rows = handle.db.select().from(agentTokens).all();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(first.token);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const second = agent.createToken(userId, id);
    expect(second.token).not.toBe(first.token);
    expect(agent.tokenStatus(userId, id)).toMatchObject({ active: true });
  });

  it("token baru mencabut yang lama; cabut menonaktifkan semuanya", () => {
    const { id } = agentCodebase();
    const old = agent.createToken(userId, id);
    const fresh = agent.createToken(userId, id);
    rejects(() => agent.authenticate(bearer(old.token)), "UNAUTHORIZED", 401);
    expect(agent.authenticate(bearer(fresh.token)).codebase.id).toBe(id);

    expect(agent.revokeTokens(userId, id)).toEqual({ revoked: 1 });
    rejects(() => agent.authenticate(bearer(fresh.token)), "UNAUTHORIZED", 401);
    expect(agent.tokenStatus(userId, id)).toEqual({
      active: false,
      expiresAt: null,
      lastUsedAt: null,
    });
  });

  it("kedaluwarsa setelah 24 jam", () => {
    const { id } = agentCodebase();
    const { token } = agent.createToken(userId, id);
    clock += 24 * HOUR - 1;
    expect(agent.authenticate(bearer(token)).codebase.id).toBe(id);
    clock += 1;
    rejects(() => agent.authenticate(bearer(token)), "UNAUTHORIZED", 401);
    expect(agent.tokenStatus(userId, id).active).toBe(false);
  });

  it("penolakan seragam untuk header hilang/rusak/token tak dikenal", () => {
    const { id } = agentCodebase();
    const { token } = agent.createToken(userId, id);
    const messages = new Set<string>();
    for (const header of [
      null,
      "",
      token,
      `Basic ${token}`,
      "Bearer pcb_pendek",
      `Bearer ${token}x`,
      `Bearer pcb_${"A".repeat(43)}`,
      `Bearer ${token.replace("pcb_", "pca_")}`,
    ]) {
      messages.add(
        rejects(() => agent.authenticate(header), "UNAUTHORIZED", 401).message,
      );
    }
    expect(messages.size).toBe(1);
    expect([...messages][0]).not.toContain(token);
  });

  it("hanya pemilik yang bisa membuat, melihat, dan mencabut token", () => {
    const { id } = agentCodebase();
    rejects(() => agent.createToken(otherId, id), "NOT_FOUND");
    rejects(() => agent.tokenStatus(otherId, id), "NOT_FOUND");
    rejects(() => agent.revokeTokens(otherId, id), "NOT_FOUND");
  });

  it("token codebase A tidak pernah menulis ke codebase B; codebase dihapus = token mati", () => {
    const a = agentCodebase();
    const b = codebases.create(userId, { name: "Lain", source: "agent", language: "id" });
    const { token } = agent.createToken(userId, a.id);
    const result = agent.submit(
      agent.authenticate(bearer(token)),
      body({ pages: [{ slug: "ringkasan", content: "# A" }] }),
    );
    expect(result.codebaseId).toBe(a.id);
    expect(codebases.listDocs(userId, b.id)).toEqual([]);

    codebases.delete(userId, a.id);
    rejects(() => agent.authenticate(bearer(token)), "UNAUTHORIZED", 401);
  });

  it(`batas laju: ${AGENT_RATE_MAX} permintaan per 10 menit per token`, () => {
    const { id } = agentCodebase();
    const { token } = agent.createToken(userId, id);
    for (let i = 0; i < AGENT_RATE_MAX; i += 1) agent.authenticate(bearer(token));
    const limited = rejects(() => agent.authenticate(bearer(token)), "VALIDATION", 429);
    expect(limited.message).toMatch(/±10 menit/);

    clock += 10 * 60 * 1000;
    expect(agent.authenticate(bearer(token)).codebase.id).toBe(id);
    expect(agent.tokenStatus(userId, id).lastUsedAt).toBe(new Date(clock).toISOString());
  });
});

describe("kiriman agen", () => {
  function session(language: "id" | "en" = "id") {
    const { id } = agentCodebase(language);
    const { token } = agent.createToken(userId, id);
    return { id, auth: () => agent.authenticate(bearer(token)) };
  }

  it("menyimpan halaman sebagai versi origin=agent, judul dari server, status ready", () => {
    const { id, auth } = session("en");
    const result = agent.submit(
      auth(),
      body({
        pages: [
          { slug: "ringkasan", content: "# Toko\nAplikasi toko." },
          { slug: "arsitektur", content: "```mermaid\nflowchart TD\nA-->B\n```" },
        ],
        detectedStack: { languages: ["TypeScript"], frontend: "Next.js", tools: [] },
      }),
    );
    expect(result).toEqual({
      codebaseId: id,
      added: ["ringkasan", "arsitektur"],
      proposed: [],
      redactions: 0,
    });

    const codebase = codebases.get(userId, id);
    expect(codebase.status).toBe("ready");
    expect(codebase.analyzedAt).toBe(new Date(clock).toISOString());
    expect(codebase.detectedStack.frontend).toBe("Next.js");
    const docs = codebases.listDocs(userId, id);
    expect(docs.map((d) => [d.slug, d.title, d.origin, d.version])).toEqual([
      ["ringkasan", "Overview", "agent", 1],
      ["arsitektur", "Architecture", "agent", 1],
    ]);
  });

  it("kiriman ulang menambah versi (tidak menimpa); isi sama tidak menambah versi", () => {
    const { id, auth } = session();
    agent.submit(auth(), body({ pages: [{ slug: "ringkasan", content: "v1" }] }));
    const again = agent.submit(
      auth(),
      body({
        pages: [
          { slug: "ringkasan", content: "v2" },
          { slug: "modul", content: "m1" },
        ],
      }),
    );
    expect(again.added).toEqual(["ringkasan", "modul"]);
    const same = agent.submit(
      auth(),
      body({ pages: [{ slug: "ringkasan", content: "v2" }] }),
    );
    expect(same.added).toEqual([]);

    const { page, versions } = codebases.getDoc(userId, id, "ringkasan");
    expect(page.content).toBe("v2");
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(codebases.getDoc(userId, id, "ringkasan", 1).page.content).toBe("v1");
  });

  it("rahasia di kiriman disensor sebelum disimpan", () => {
    const { id, auth } = session();
    const result = agent.submit(
      auth(),
      body({
        pages: [
          { slug: "menjalankan", content: `Isi .env:\nANTHROPIC_API_KEY=${fakeKey}\n` },
        ],
      }),
    );
    expect(result.redactions).toBeGreaterThan(0);
    expect(codebases.getDoc(userId, id, "menjalankan").page.content).not.toContain(
      fakeKey,
    );
  });

  it("skema ketat: slug tak dikenal/ganda, kunci asing, judul, isi kosong, bukan JSON", () => {
    const { auth } = session();
    const cases: unknown[] = [
      { pages: [] },
      { pages: [{ slug: "rahasia", content: "x" }] },
      {
        pages: [
          { slug: "ringkasan", content: "a" },
          { slug: "ringkasan", content: "b" },
        ],
      },
      { pages: [{ slug: "ringkasan", content: "x", title: "Judul sisipan" }] },
      { pages: [{ slug: "ringkasan", content: "   " }] },
      { pages: [{ slug: "ringkasan", content: "x".repeat(40_001) }] },
      { pages: [{ slug: "ringkasan", content: "x" }], admin: true },
      {
        pages: [{ slug: "ringkasan", content: "x" }],
        detectedStack: { languages: "TS" },
      },
      [],
    ];
    for (const value of cases) {
      rejects(() => agent.submit(auth(), body(value)), "VALIDATION", 400);
    }
    rejects(
      () => agent.submit(auth(), new TextEncoder().encode("{rusak")),
      "VALIDATION",
      400,
    );
  });

  it("409 selama analisis server berjalan", () => {
    const { id, auth } = session();
    const current = auth();
    repo.update(userId, id, { status: "analyzing" });
    rejects(
      () => agent.submit(current, body({ pages: [{ slug: "ringkasan", content: "x" }] })),
      "CONFLICT",
      409,
    );
  });
});

describe("tempel hasil (import-markdown) dan URL dasar prompt", () => {
  it("menyimpan halaman dari Markdown bersekat sebagai origin=agent", () => {
    const { id } = agentCodebase();
    const result = agent.importMarkdown(
      userId,
      id,
      `Hasil:\n<!-- piard:page ringkasan -->\n# Ringkasan\nToko\n<!-- piard:page menjalankan -->\nANTHROPIC_API_KEY=${fakeKey}`,
    );
    expect(result.added).toEqual(["ringkasan", "menjalankan"]);
    expect(result.fixes).toEqual(
      expect.arrayContaining(["dropped_preamble", "dropped_title"]),
    );
    expect(result.redactions).toBeGreaterThan(0);
    expect(codebases.getDoc(userId, id, "ringkasan").page).toMatchObject({
      content: "Toko",
      origin: "agent",
    });
    expect(codebases.getDoc(userId, id, "menjalankan").page.content).not.toContain(
      fakeKey,
    );
    expect(codebases.get(userId, id).status).toBe("ready");
  });

  it("format keliru ditolak dengan pesan yang menyebut masalahnya; milik orang lain 404", () => {
    const { id } = agentCodebase();
    const error = rejects(
      () => agent.importMarkdown(userId, id, "<!-- piard:page rahasia -->\nx"),
      "VALIDATION",
      400,
    );
    expect(error.message).toMatch(/"rahasia" tidak dikenal/);
    rejects(() => agent.importMarkdown(userId, id, "tanpa penanda"), "VALIDATION");
    rejects(
      () => agent.importMarkdown(otherId, id, "<!-- piard:page ringkasan -->\nx"),
      "NOT_FOUND",
    );
    expect(codebases.listDocs(userId, id)).toEqual([]);
  });

  it("APP_URL mengalahkan origin permintaan; localhost ditandai", () => {
    expect(agent.baseUrl("http://localhost:3000/codebases/x")).toEqual({
      baseUrl: "http://localhost:3000",
      local: true,
    });
    const configured = createAgentService(repo, {
      own: codebases.own,
      appUrl: "https://piard.example.com",
    });
    expect(configured.baseUrl("http://localhost:3000")).toEqual({
      baseUrl: "https://piard.example.com",
      local: false,
    });
  });
});
