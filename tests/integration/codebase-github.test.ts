import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GithubFetch } from "@/features/codebase/server/github";
import { createCodebaseRepo } from "@/features/codebase/server/repo";
import {
  type CodebaseService,
  createCodebaseService,
} from "@/features/codebase/server/service";
import { createSourceStore } from "@/features/codebase/server/source-store";
import type { DbHandle } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { createTestDb, seedUser } from "../helpers/test-db";

/** M7-06: sumber dari URL GitHub dengan `fetch` tiruan (tanpa jaringan nyata). */

type Call = { url: string; headers: Record<string, string>; redirect?: string };
type Reply = (url: URL, call: Call) => Response | Promise<Response>;

const TOKEN = `ghp_${"A".repeat(36)}`;
const CODELOAD =
  "https://codeload.github.com/toko/web/legacy.zip/refs/heads/main?token=SEKALI";
const fakeKey = `sk${"-ant-"}api03-${"abcdefghijklmnopqrstu"}`;

let handle: DbHandle;
let repo: ReturnType<typeof createCodebaseRepo>;
let sourceDir: string;
let userId: string;
let otherId: string;
let calls: Call[];
let routes: Record<string, Reply>;

const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init);
const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

const repoZip = () =>
  zipSync({
    "toko-web-abc123/README.md": strToU8("# Toko"),
    "toko-web-abc123/package.json": strToU8(
      JSON.stringify({ dependencies: { next: "16" } }),
    ),
    "toko-web-abc123/.env": strToU8(`ANTHROPIC_API_KEY=${fakeKey}`),
    "toko-web-abc123/apps/web/src/page.tsx": strToU8("export const Page = 1"),
    "toko-web-abc123/apps/web/package.json": strToU8(JSON.stringify({ name: "web" })),
    "toko-web-abc123/apps/api/main.go": strToU8("package main"),
    "toko-web-abc123/node_modules/x/index.js": strToU8("x"),
  });

/** GitHub tiruan: repo `toko/web` publik dengan cabang `main` dan `feature/x`. */
function defaultRoutes(): Record<string, Reply> {
  return {
    "api.github.com/repos/toko/web": () =>
      json({ default_branch: "main", private: false }),
    "api.github.com/repos/toko/web/commits/main": () => new Response("abc123"),
    "api.github.com/repos/toko/web/commits/feature": () => json({}, { status: 422 }),
    "api.github.com/repos/toko/web/commits/feature/x": () => new Response("def456"),
    "api.github.com/repos/toko/web/zipball/main": () => redirect(CODELOAD),
    "api.github.com/repos/toko/web/zipball/feature/x": () => redirect(CODELOAD),
    "codeload.github.com/toko/web/legacy.zip/refs/heads/main": () =>
      new Response(repoZip(), { headers: { "content-type": "application/zip" } }),
  };
}

const fakeFetch: GithubFetch = async (input, init) => {
  const url = new URL(input);
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const call: Call = { url: input, headers, redirect: init.redirect };
  calls.push(call);
  const reply = routes[`${url.hostname}${url.pathname}`];
  return reply ? reply(url, call) : json({ message: "Not Found" }, { status: 404 });
};

function makeService(maxUploadBytes = 1024 * 1024, fetchImpl: GithubFetch = fakeFetch) {
  return createCodebaseService(repo, {
    store: createSourceStore(sourceDir),
    maxUploadBytes,
    fetch: fetchImpl,
  });
}

let service: CodebaseService;

beforeEach(() => {
  handle = createTestDb();
  repo = createCodebaseRepo(handle.db);
  sourceDir = mkdtempSync(join(tmpdir(), "piard-github-"));
  userId = seedUser(handle.db).id;
  otherId = seedUser(handle.db, "lain@piard.local").id;
  calls = [];
  routes = defaultRoutes();
  service = makeService();
});
afterEach(() => {
  handle.close();
  rmSync(sourceDir, { recursive: true, force: true });
});

const githubCodebase = () =>
  service.create(userId, { name: "Toko", source: "github", language: "id" });

async function expectRejects(
  run: () => Promise<unknown>,
  code: string,
  message?: RegExp,
  status?: number,
): Promise<AppError> {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `diharapkan AppError ${code}`).toBeInstanceOf(AppError);
  const error = thrown as AppError;
  expect(error.code).toBe(code);
  if (message) expect(error.message).toMatch(message);
  if (status) expect(error.status).toBe(status);
  return error;
}

const storedPaths = (id: string) =>
  createSourceStore(sourceDir)
    .load(id)
    ?.map((f) => f.path);

describe("receiveGithub: repo publik", () => {
  it("mengunduh cabang bawaan, melepas pembungkus, menyensor, status source_ready", async () => {
    const { id } = githubCodebase();
    const result = await service.receiveGithub(userId, id, {
      url: "https://github.com/toko/web",
    });

    expect(result.status).toBe("source_ready");
    expect(result.sourceRef).toBe("https://github.com/toko/web");
    expect(result.detectedStack.frontend).toBe("Next.js");
    expect(storedPaths(id)).toEqual([
      ".env",
      "README.md",
      "apps/api/main.go",
      "apps/web/package.json",
      "apps/web/src/page.tsx",
      "package.json",
    ]);
    const stored = readFileSync(join(sourceDir, readdirSync(sourceDir)[0] ?? ""), "utf8");
    expect(stored).not.toContain(fakeKey);

    // Hanya host yang diizinkan, selalu tanpa mengikuti pengalihan otomatis.
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual([
      "api.github.com",
      "api.github.com",
      "codeload.github.com",
    ]);
    expect(calls.every((c) => c.redirect === "manual")).toBe(true);
    expect(calls.every((c) => c.headers["user-agent"] === "piard")).toBe(true);
  });

  it("cabang bersarang + subfolder: hanya isi subfolder, jalur relatif", async () => {
    const { id } = githubCodebase();
    const result = await service.receiveGithub(userId, id, {
      url: "github.com/toko/web/tree/feature/x/apps/web",
    });
    expect(result.sourceRef).toBe("https://github.com/toko/web/tree/feature/x/apps/web");
    expect(storedPaths(id)).toEqual(["package.json", "src/page.tsx"]);
    // Prefiks terpendek dicoba dulu: `feature` (422) lalu `feature/x`.
    expect(calls.filter((c) => c.url.includes("/commits/")).map((c) => c.url)).toEqual([
      "https://api.github.com/repos/toko/web/commits/feature",
      "https://api.github.com/repos/toko/web/commits/feature/x",
    ]);
  });

  it("subfolder tunggal tidak dilepas lagi sebagai pembungkus", async () => {
    const { id } = githubCodebase();
    await service.receiveGithub(userId, id, {
      url: "github.com/toko/web/tree/main/apps",
    });
    expect(storedPaths(id)).toEqual([
      "api/main.go",
      "web/package.json",
      "web/src/page.tsx",
    ]);
  });

  it("mengikuti pengalihan API ke api.github.com (repo diganti nama)", async () => {
    routes["api.github.com/repos/lama/web"] = () =>
      redirect("https://api.github.com/repos/toko/web", 301);
    routes["api.github.com/repos/lama/web/zipball/main"] = () => redirect(CODELOAD);
    const { id } = githubCodebase();
    const result = await service.receiveGithub(userId, id, {
      url: "github.com/lama/web",
    });
    expect(result.status).toBe("source_ready");
  });
});

describe("receiveGithub: ditolak", () => {
  it("URL tidak valid ditolak tanpa satu pun permintaan jaringan", async () => {
    const { id } = githubCodebase();
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "http://127.0.0.1/toko/web" }),
      "VALIDATION",
      /bukan URL GitHub/,
    );
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "https://u:p@github.com/toko/web" }),
      "VALIDATION",
      /nama pengguna atau token/,
    );
    expect(calls).toEqual([]);
  });

  it("pengalihan ke host lain ditolak dan tidak pernah dihubungi (SSRF)", async () => {
    const { id } = githubCodebase();
    for (const location of [
      "https://evil.test/x.zip",
      "http://codeload.github.com/toko/web/zip/main",
      "https://codeload.github.com:444/x",
      "https://u:p@codeload.github.com/x",
      "https://169.254.169.254/latest/meta-data",
    ]) {
      routes["api.github.com/repos/toko/web/zipball/main"] = () => redirect(location);
      await expectRejects(
        () => service.receiveGithub(userId, id, { url: "github.com/toko/web" }),
        "VALIDATION",
        /tidak dikenal/,
        502,
      );
    }
    routes["api.github.com/repos/toko/web"] = () =>
      redirect("https://evil.test/repos", 301);
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "VALIDATION",
      /tidak dikenal/,
    );
    const hosts = new Set(calls.map((c) => new URL(c.url).hostname));
    expect([...hosts]).toEqual(["api.github.com"]);
    expect(repo.find(userId, id)?.status).toBe("awaiting_source");
  });

  it("repo tidak ada, cabang tidak ada, subfolder tidak ada, repo kosong", async () => {
    const { id } = githubCodebase();
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "github.com/toko/hilang" }),
      "VALIDATION",
      /tidak ditemukan.*repo privat/,
      404,
    );
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "github.com/toko/web/tree/v9" }),
      "VALIDATION",
      /"v9" tidak ada/,
      404,
    );
    await expectRejects(
      () =>
        service.receiveGithub(userId, id, { url: "github.com/toko/web/tree/main/docs" }),
      "VALIDATION",
      /Folder "docs" tidak ada/,
    );
    routes["api.github.com/repos/toko/web"] = () =>
      json({ message: "empty" }, { status: 409 });
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "VALIDATION",
      /masih kosong/,
    );
  });

  it("batas laju GitHub menyebut kapan bisa mencoba lagi", async () => {
    const reset = Math.floor((Date.now() + 10 * 60_000) / 1000);
    routes["api.github.com/repos/toko/web"] = () =>
      json(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
        },
      );
    const { id } = githubCodebase();
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "VALIDATION",
      /Batas permintaan GitHub.*±1[01] menit/,
      429,
    );
  });

  it("arsip melebihi batas: dari Content-Length dan dari byte yang dibaca", async () => {
    const small = makeService(1024);
    const { id } = small.create(userId, { name: "T", source: "github", language: "id" });
    await expectRejects(
      () => small.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "VALIDATION",
      /melebihi batas/,
      413,
    );
    // Tanpa Content-Length (stream): tetap dihentikan saat dibaca.
    routes["codeload.github.com/toko/web/legacy.zip/refs/heads/main"] = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(repoZip());
            controller.close();
          },
        }),
      );
    await expectRejects(
      () => small.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "VALIDATION",
      /melebihi batas/,
      413,
    );
  });

  it("galat jaringan dan waktu habis menjadi pesan jelas tanpa membawa URL", async () => {
    const { id } = githubCodebase();
    const offline = makeService(1024 * 1024, async () => {
      throw new TypeError(`fetch failed ${CODELOAD}`);
    });
    const down = await expectRejects(
      () => offline.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "VALIDATION",
      /tidak bisa dihubungi/,
      503,
    );
    expect(down.cause).toBeUndefined();

    const slow = makeService(1024 * 1024, async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    await expectRejects(
      () => slow.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "VALIDATION",
      /terlalu lama/,
      504,
    );
  });

  it("sumber salah, analisis berjalan, dan milik orang lain", async () => {
    const zip = service.create(userId, { name: "Z", source: "zip", language: "id" });
    await expectRejects(
      () => service.receiveGithub(userId, zip.id, { url: "github.com/toko/web" }),
      "VALIDATION",
      /hanya untuk proyek bersumber GitHub/,
    );
    const { id } = githubCodebase();
    await expectRejects(
      () => service.receiveGithub(otherId, id, { url: "github.com/toko/web" }),
      "NOT_FOUND",
    );
    repo.update(userId, id, { status: "analyzing" });
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "CONFLICT",
    );
    expect(calls).toEqual([]);
  });

  it("analisis yang dimulai selama unduhan membuat sumber ditolak", async () => {
    const { id } = githubCodebase();
    routes["api.github.com/repos/toko/web/zipball/main"] = () => {
      repo.update(userId, id, { status: "analyzing" });
      return redirect(CODELOAD);
    };
    await expectRejects(
      () => service.receiveGithub(userId, id, { url: "github.com/toko/web" }),
      "CONFLICT",
    );
    expect(storedPaths(id)).toBeUndefined();
  });
});

describe("receiveGithub: token repo privat (P1)", () => {
  it("token hanya dikirim ke api.github.com dan tidak tersimpan", async () => {
    const { id } = githubCodebase();
    const result = await service.receiveGithub(userId, id, {
      url: "github.com/toko/web",
      token: TOKEN,
    });
    const api = calls.filter((c) => new URL(c.url).hostname === "api.github.com");
    const codeload = calls.filter(
      (c) => new URL(c.url).hostname === "codeload.github.com",
    );
    expect(api.every((c) => c.headers.authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(codeload).toHaveLength(1);
    expect(codeload[0]?.headers.authorization).toBeUndefined();

    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(repo.find(userId, id))).not.toContain(TOKEN);
    expect(readFileSync(join(sourceDir, `${id}.json`), "utf8")).not.toContain(TOKEN);
  });

  it("token ditolak atau tanpa akses: pesan khusus, token tidak muncul di galat", async () => {
    const { id } = githubCodebase();
    routes["api.github.com/repos/toko/web"] = () => json({}, { status: 401 });
    const bad = await expectRejects(
      () =>
        service.receiveGithub(userId, id, { url: "github.com/toko/web", token: TOKEN }),
      "VALIDATION",
      /Token GitHub ditolak/,
    );
    routes["api.github.com/repos/toko/web"] = () => json({}, { status: 404 });
    const noAccess = await expectRejects(
      () =>
        service.receiveGithub(userId, id, { url: "github.com/toko/web", token: TOKEN }),
      "VALIDATION",
      /token ini tidak punya akses/,
    );
    for (const error of [bad, noAccess]) {
      expect(`${error.message} ${String(error.cause)} ${error.stack}`).not.toContain(
        TOKEN,
      );
    }
  });
});
