import { beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { documents } from "@/server/db/schema";
import { seedBoard } from "../helpers/plan-seed";
import {
  callRoute,
  type Json,
  type Methods,
  makeRequest,
  type RequestOptions,
  setupUsers,
} from "../helpers/route-harness";

/**
 * M8-04…M8-07, M8-11, M8-12 lewat route handler sungguhan: token, API baca/tulis agen, tinjauan
 * pengguna, linimasa catatan, meta kanban, dan event papan. Penolakan keamanan ada di
 * `agent-bridge-security.test.ts`.
 */

const r: Record<string, Methods> = {};
let db: DbHandle["db"];
let cookie = "";
let userId = "";

async function load(prefix: "agent" | "plan", paths: string[]) {
  for (const path of paths) {
    r[`${prefix}/${path}`] = (await import(
      `@/app/api/${prefix}/${path}/route`
    )) as Methods;
  }
}

beforeAll(async () => {
  ({ db, cookie, userId } = await setupUsers());
  await load("agent", [
    "plan",
    "tasks",
    "tasks/next",
    "tasks/[id]",
    "tasks/[id]/claim",
    "tasks/[id]/report",
    "tasks/[id]/release",
    "tasks/[id]/notes",
    "documents/prd",
  ]);
  await load("plan", [
    "agent-tokens",
    "agent-tokens/[id]",
    "agent-tokens/revoke-all",
    "agent-board",
    "tasks/[id]/notes",
    "tasks/[id]/review",
    "tasks/[id]/release",
    "[id]",
    "tasks/list",
  ]);
});

type Board = ReturnType<typeof seedBoard>;

function ids(board: Board) {
  return board.features.flatMap((f) => f.tasks.map((t) => t.id));
}

async function createToken(planId: string, label = "Laptop", as = cookie) {
  const res = await callRoute(
    r["plan/agent-tokens"]?.POST,
    makeRequest("POST", "/api/plan/agent-tokens", { planId, label }, { cookie: as }),
  );
  return res;
}

async function newBoard() {
  const board = seedBoard(db, userId);
  const res = await createToken(board.plan.id);
  expect(res.status).toBe(200);
  return { board, token: String(res.json.token) };
}

/** Panggilan agen: `path` alamat, `route` kunci handler. */
async function agent(
  method: "GET" | "POST",
  route: string,
  token: string,
  options: { id?: string; body?: unknown; query?: string } & RequestOptions = {},
) {
  const path = `/api/${route.replace("[id]", options.id ?? "")}${options.query ?? ""}`;
  return callRoute(
    r[route]?.[method],
    makeRequest(method, path, options.body, { bearer: token }),
    options.id ? { id: options.id } : {},
  );
}

async function user(method: "GET" | "POST", route: string, id: string, body?: unknown) {
  const path = `/api/${route.replace("[id]", id)}`;
  return callRoute(r[route]?.[method], makeRequest(method, path, body, { cookie }), {
    id,
  });
}

describe("token agen (pengguna)", () => {
  it("buat sekali tampil, daftar tanpa nilai, cabut satu dan semua", async () => {
    const board = seedBoard(db, userId);
    const created = await createToken(board.plan.id, "Laptop kerja");
    expect(created.status).toBe(200);
    expect(String(created.json.token)).toMatch(/^ppl_[A-Za-z0-9_-]{43}$/);
    const agentToken = created.json.agentToken as Json;
    expect(agentToken).toMatchObject({
      label: "Laptop kerja",
      active: true,
      lastUsedAt: null,
    });
    const days = (Date.parse(String(agentToken.expiresAt)) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    const list = await callRoute(
      r["plan/agent-tokens"]?.GET,
      makeRequest("GET", `/api/plan/agent-tokens?planId=${board.plan.id}`, undefined, {
        cookie,
      }),
    );
    expect(JSON.stringify(list.json)).not.toContain(String(created.json.token));
    expect(list.json.tokens).toHaveLength(1);

    const revoked = await callRoute(
      r["plan/agent-tokens/[id]"]?.DELETE,
      makeRequest("DELETE", `/api/plan/agent-tokens/${agentToken.id}`, undefined, {
        cookie,
      }),
      { id: String(agentToken.id) },
    );
    expect(revoked.json.agentToken).toMatchObject({ active: false });

    await createToken(board.plan.id, "A");
    await createToken(board.plan.id, "B");
    const all = await callRoute(
      r["plan/agent-tokens/revoke-all"]?.POST,
      makeRequest(
        "POST",
        "/api/plan/agent-tokens/revoke-all",
        { planId: board.plan.id },
        { cookie },
      ),
    );
    expect(all.json).toEqual({ revoked: 2 });
  });

  it("masa berlaku 7/30/90 hari; nilai lain ditolak; maks 5 token aktif", async () => {
    const board = seedBoard(db, userId);
    const seven = await callRoute(
      r["plan/agent-tokens"]?.POST,
      makeRequest(
        "POST",
        "/api/plan/agent-tokens",
        { planId: board.plan.id, label: "x", ttlDays: 7 },
        { cookie },
      ),
    );
    const expires = Date.parse(String((seven.json.agentToken as Json).expiresAt));
    expect(Math.round((expires - Date.now()) / 86_400_000)).toBe(7);
    const bad = await callRoute(
      r["plan/agent-tokens"]?.POST,
      makeRequest(
        "POST",
        "/api/plan/agent-tokens",
        { planId: board.plan.id, label: "x", ttlDays: 365 },
        { cookie },
      ),
    );
    expect(bad.status).toBe(400);
    for (let i = 0; i < 4; i++)
      expect((await createToken(board.plan.id)).status).toBe(200);
    const sixth = await createToken(board.plan.id);
    expect(sixth.status).toBe(409);
    expect(String(sixth.json.error)).toContain("5 token aktif");
  });
});

describe("API baca agen", () => {
  it("ringkasan plan, daftar, detail dengan konteks, PRD", async () => {
    const { board, token } = await newBoard();
    db.insert(documents)
      .values({
        planId: board.plan.id,
        content:
          "# PRD\n\n## 1. Ringkasan\nAplikasi klinik.\n\n## 3. Fitur\nBooking memakai kalender.\n\n## 4. Data\nTabel pasien.",
      })
      .run();
    const overview = await agent("GET", "agent/plan", token);
    expect(overview.status).toBe(200);
    expect(overview.json).toMatchObject({
      plan: { id: board.plan.id, title: "Klinik" },
      progress: { todo: 3, doing: 0, review: 0, done: 0 },
      instructions: null,
      you: { label: "Laptop", holding: null },
    });
    expect(overview.json.features).toEqual([
      expect.objectContaining({ name: "Booking", taskCount: 2 }),
      expect.objectContaining({ name: "Pembayaran", taskCount: 1 }),
    ]);

    const list = await agent("GET", "agent/tasks", token, { query: "?status=todo" });
    expect((list.json.tasks as Json[]).map((t) => t.title)).toEqual([
      "Task 1.1",
      "Task 1.2",
      "Task 2.1",
    ]);
    expect(JSON.stringify(list.json)).not.toContain("Kerjakan task");

    const [first = ""] = ids(board);
    const detail = await agent("GET", "agent/tasks/[id]", token, { id: first });
    expect(detail.json.task).toMatchObject({
      id: first,
      prompt: "Kerjakan task 1.1",
      claimedByYou: false,
      feature: { name: "Booking", spec: expect.stringContaining("Spesifikasi fitur 1") },
      notes: [],
    });
    const excerpt = String((detail.json.task as Json).prdExcerpt);
    expect(excerpt).toContain("Booking memakai kalender");
    expect(excerpt).not.toContain("Tabel pasien");

    const prd = await agent("GET", "agent/documents/prd", token);
    expect(prd.json.prd).toMatchObject({ version: 1, truncated: false });
  });

  it("instruksi proyek ikut di ringkasan dan detail; plan tanpa instruksi tetap null", async () => {
    const { board, token } = await newBoard();
    const patch = await callRoute(
      r["plan/[id]"]?.PATCH,
      makeRequest(
        "PATCH",
        `/api/plan/${board.plan.id}`,
        { agentInstructions: "Jalankan `pnpm test` sebelum melapor." },
        { cookie },
      ),
      { id: board.plan.id },
    );
    expect(patch.status).toBeLessThan(300);
    const overview = await agent("GET", "agent/plan", token);
    expect(overview.json.instructions).toBe("Jalankan `pnpm test` sebelum melapor.");
    const next = await agent("GET", "agent/tasks/next", token);
    expect((next.json.task as Json).instructions).toContain("pnpm test");

    await callRoute(
      r["plan/[id]"]?.PATCH,
      makeRequest(
        "PATCH",
        `/api/plan/${board.plan.id}`,
        { agentInstructions: "" },
        { cookie },
      ),
      { id: board.plan.id },
    );
    expect((await agent("GET", "agent/plan", token)).json.instructions).toBeNull();
  });
});

describe("alur kerja satu card", () => {
  it("ambil → klaim → tanya → jawab → lapor → minta perbaikan → lapor → setujui", async () => {
    const { board, token } = await newBoard();
    const [first = ""] = ids(board);

    const next = await agent("GET", "agent/tasks/next", token);
    expect(next.json).toMatchObject({ alreadyClaimed: false, task: { id: first } });

    const claim = await agent("POST", "agent/tasks/[id]/claim", token, { id: first });
    expect(claim.status).toBe(200);
    expect(claim.json.task).toMatchObject({ status: "doing", claimedByYou: true });
    // Klaim ulang idempoten; get_next_task mengembalikan task yang dipegang.
    expect(
      (await agent("POST", "agent/tasks/[id]/claim", token, { id: first })).status,
    ).toBe(200);
    expect((await agent("GET", "agent/tasks/next", token)).json).toMatchObject({
      alreadyClaimed: true,
      task: { id: first },
    });

    const question = await agent("POST", "agent/tasks/[id]/notes", token, {
      id: first,
      body: { kind: "question", body: "Pakai zona waktu apa?" },
    });
    expect(question.json.note).toMatchObject({
      author: "agent",
      kind: "question",
      tokenLabel: "Laptop",
    });
    let meta = await callRoute(
      r["plan/agent-board"]?.GET,
      makeRequest("GET", `/api/plan/agent-board?planId=${board.plan.id}`, undefined, {
        cookie,
      }),
    );
    expect((meta.json.cards as Record<string, Json>)[first]).toMatchObject({
      tokenLabel: "Laptop",
      openQuestion: true,
      notes: 1,
    });

    await user("POST", "plan/tasks/[id]/notes", first, { body: "Asia/Jakarta." });
    meta = await callRoute(
      r["plan/agent-board"]?.GET,
      makeRequest("GET", `/api/plan/agent-board?planId=${board.plan.id}`, undefined, {
        cookie,
      }),
    );
    expect((meta.json.cards as Record<string, Json>)[first]?.openQuestion).toBe(false);
    const withAnswer = await agent("GET", "agent/tasks/[id]", token, { id: first });
    expect(JSON.stringify(withAnswer.json)).toContain("Asia/Jakarta.");

    const report = await agent("POST", "agent/tasks/[id]/report", token, {
      id: first,
      body: {
        summary: "Form booking dan validasi jam selesai.",
        verification: "pnpm test: 12 lulus",
        filesChanged: ["src/booking.ts"],
      },
    });
    expect(report.status).toBe(200);
    expect(report.json.task).toMatchObject({ status: "review" });
    // Lapor ulang idempoten (tidak menambah catatan).
    await agent("POST", "agent/tasks/[id]/report", token, {
      id: first,
      body: {
        summary: "Form booking dan validasi jam selesai.",
        verification: "pnpm test",
      },
    });

    const changes = await user("POST", "plan/tasks/[id]/review", first, {
      decision: "changes",
      note: "Tambahkan validasi hari libur.",
    });
    expect(changes.json.task).toMatchObject({ status: "todo", agentTokenId: null });

    await agent("POST", "agent/tasks/[id]/claim", token, { id: first });
    const detail = await agent("GET", "agent/tasks/[id]", token, { id: first });
    expect(JSON.stringify(detail.json)).toContain("Tambahkan validasi hari libur.");
    await agent("POST", "agent/tasks/[id]/report", token, {
      id: first,
      body: {
        summary: "Validasi hari libur ditambahkan.",
        verification: "pnpm test lulus",
      },
    });
    const approve = await user("POST", "plan/tasks/[id]/review", first, {
      decision: "approve",
    });
    expect(approve.json.task).toMatchObject({ status: "done" });

    const notes = await user("GET", "plan/tasks/[id]/notes", first);
    const timeline = (notes.json.notes as Json[]).map((n) => `${n.author}:${n.kind}`);
    expect(timeline).toEqual([
      "agent:event", // klaim
      "agent:question",
      "user:note",
      "agent:report",
      "agent:event", // lapor
      "user:note", // alasan perbaikan
      "user:event", // minta perbaikan
      "agent:event", // klaim ulang
      "agent:report",
      "agent:event",
      "user:event", // setujui
    ]);
    const firstReport = (notes.json.notes as Json[]).find((n) => n.kind === "report");
    expect(String(firstReport?.body)).toContain("`src/booking.ts`");
  });

  it("lepas oleh agen menyimpan alasan; lepas oleh pengguna mengambil kembali card agen", async () => {
    const { board, token } = await newBoard();
    const [a = "", b = ""] = ids(board);
    await agent("POST", "agent/tasks/[id]/claim", token, { id: a });
    const release = await agent("POST", "agent/tasks/[id]/release", token, {
      id: a,
      body: { reason: "Butuh akses API pembayaran." },
    });
    expect(release.json.task).toMatchObject({ status: "todo" });
    const notes = await user("GET", "plan/tasks/[id]/notes", a);
    expect((notes.json.notes as Json[]).map((n) => n.body)).toContain(
      "Butuh akses API pembayaran.",
    );

    await agent("POST", "agent/tasks/[id]/claim", token, { id: b });
    const taken = await user("POST", "plan/tasks/[id]/release", b);
    expect(taken.json.task).toMatchObject({ status: "todo", agentTokenId: null });
    expect((await user("POST", "plan/tasks/[id]/release", b)).status).toBe(409);
    // Token tidak lagi memegang apa pun: bisa mengklaim card lain.
    expect((await agent("POST", "agent/tasks/[id]/claim", token, { id: a })).status).toBe(
      200,
    );
  });

  it("perubahan oleh agen dan tinjauan dipancarkan ke pendengar papan plan", async () => {
    const { subscribeBoard } = await import("@/features/agent-bridge/server");
    const { board, token } = await newBoard();
    const [first = ""] = ids(board);
    const seen: string[] = [];
    const stop = subscribeBoard(board.plan.id, (e) =>
      seen.push(`${e.reason}:${e.status}`),
    );
    await agent("POST", "agent/tasks/[id]/claim", token, { id: first });
    await agent("POST", "agent/tasks/[id]/notes", token, {
      id: first,
      body: { body: "Mulai." },
    });
    await agent("POST", "agent/tasks/[id]/report", token, {
      id: first,
      body: { summary: "Selesai dikerjakan.", verification: "tes lulus" },
    });
    await user("POST", "plan/tasks/[id]/review", first, { decision: "approve" });
    stop();
    await user("POST", "plan/tasks/[id]/notes", first, { body: "Tidak terdengar." });
    expect(seen).toEqual(["claim:doing", "note:doing", "report:review", "review:done"]);
  });
});
