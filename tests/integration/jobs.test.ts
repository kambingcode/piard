import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { AppError, INTERNAL_ERROR_MESSAGE } from "@/server/http/errors";
import type { JobEvent, JobHandler, JobRunner } from "@/server/jobs";
import { createJobRepo, createJobRunner, MAX_JOB_ATTEMPTS } from "@/server/jobs";
import { createLogger } from "@/server/logger";
import { createTestDb } from "../helpers/test-db";

const logger = createLogger({ level: "silent", sink: () => undefined });

let handle: DbHandle;

beforeEach(() => {
  handle = createTestDb();
});
afterEach(() => handle.close());

function newRunner(handlers: Record<string, JobHandler> = {}): JobRunner {
  const runner = createJobRunner({ repo: createJobRepo(handle.db), logger });
  for (const [kind, handler] of Object.entries(handlers)) runner.register(kind, handler);
  return runner;
}

/** Handler contoh: menghitung 1..total, menyimpan hasil per langkah, dan melanjutkan dari `done`. */
function countingHandler(output: number[], total = 4): JobHandler {
  return async ({ job, progress, signal }) => {
    for (let step = job.progress.done + 1; step <= total; step++) {
      if (signal.aborted) return;
      output.push(step);
      progress({ phase: `langkah ${step}`, done: step, total });
    }
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("menjalankan job", () => {
  it("menjalankan handler, melaporkan progres, dan menandai succeeded", async () => {
    const output: number[] = [];
    const runner = newRunner({ count: countingHandler(output) });
    const events: JobEvent[] = [];
    runner.subscribe((e) => events.push(e));

    const job = runner.enqueue({ kind: "count", planId: null });
    expect(job.state).toBe("queued");
    await runner.idle();

    expect(output).toEqual([1, 2, 3, 4]);
    const done = runner.get(job.id);
    expect(done).toMatchObject({
      state: "succeeded",
      attempts: 1,
      error: null,
      progress: { phase: "langkah 4", done: 4, total: 4 },
    });
    expect(events.map((e) => `${e.state}:${e.progress.done}`)).toEqual([
      "queued:0",
      "running:0",
      "running:1",
      "running:2",
      "running:3",
      "running:4",
      "succeeded:4",
    ]);
  });

  it("memproses satu per satu sesuai urutan masuk", async () => {
    const order: string[] = [];
    const gate = deferred();
    const runner = newRunner({
      slow: async ({ job }) => {
        order.push(`mulai ${job.payload.n}`);
        if (job.payload.n === 1) await gate.promise;
        order.push(`selesai ${job.payload.n}`);
      },
    });
    runner.enqueue({ kind: "slow", payload: { n: 1 } });
    runner.enqueue({ kind: "slow", payload: { n: 2 } });
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["mulai 1"]);

    gate.resolve();
    await runner.idle();
    expect(order).toEqual(["mulai 1", "selesai 1", "mulai 2", "selesai 2"]);
  });

  it("menolak jenis job yang tidak punya handler", () => {
    expect(() => newRunner().enqueue({ kind: "tidak-ada" })).toThrow(/handler/);
  });

  it("menolak pendaftaran handler ganda", () => {
    const runner = newRunner({ a: async () => undefined });
    expect(() => runner.register("a", async () => undefined)).toThrow(/sudah terdaftar/);
  });
});

describe("dedupe", () => {
  it("mengembalikan job aktif yang sama untuk jenis, plan, dan muatan sama", async () => {
    const gate = deferred();
    const runner = newRunner({ work: () => gate.promise });
    const a = runner.enqueue({ kind: "work", payload: { x: 1, y: { b: 2, a: 1 } } });
    const b = runner.enqueue({ kind: "work", payload: { y: { a: 1, b: 2 }, x: 1 } });
    expect(b.id).toBe(a.id);

    const c = runner.enqueue({ kind: "work", payload: { x: 2 } });
    expect(c.id).not.toBe(a.id);
    const d = runner.enqueue({
      kind: "work",
      payload: { x: 1, y: { b: 2, a: 1 } },
      dedupe: false,
    });
    expect(d.id).not.toBe(a.id);

    gate.resolve();
    await runner.idle();
  });

  it("boleh membuat job baru setelah yang lama selesai", async () => {
    const runner = newRunner({ work: async () => undefined });
    const first = runner.enqueue({ kind: "work" });
    await runner.idle();
    expect(runner.enqueue({ kind: "work" }).id).not.toBe(first.id);
    await runner.idle();
  });
});

describe("kegagalan", () => {
  it("menyimpan pesan AppError apa adanya", async () => {
    const runner = newRunner({
      fail: async () => {
        throw new AppError("UPSTREAM_AI", "Model tidak menjawab.");
      },
    });
    const job = runner.enqueue({ kind: "fail" });
    await runner.idle();
    expect(runner.get(job.id)).toMatchObject({
      state: "failed",
      error: "Model tidak menjawab.",
    });
  });

  it("menyembunyikan detail galat tak terduga", async () => {
    const runner = newRunner({
      boom: async () => {
        throw new Error("SQLITE_BUSY rahasia");
      },
    });
    const job = runner.enqueue({ kind: "boom" });
    await runner.idle();
    const saved = runner.get(job.id);
    expect(saved?.state).toBe("failed");
    expect(saved?.error).toBe(INTERNAL_ERROR_MESSAGE);
  });

  it("tetap menjalankan job berikutnya setelah satu gagal", async () => {
    const output: number[] = [];
    const runner = newRunner({
      boom: async () => {
        throw new Error("x");
      },
      count: countingHandler(output, 1),
    });
    runner.enqueue({ kind: "boom" });
    const ok = runner.enqueue({ kind: "count" });
    await runner.idle();
    expect(runner.get(ok.id)?.state).toBe("succeeded");
  });

  it("retry mengantrekan ulang job gagal dan menolak job yang bukan gagal", async () => {
    let attempt = 0;
    const runner = newRunner({
      flaky: async () => {
        attempt += 1;
        if (attempt === 1) throw new AppError("UPSTREAM_AI", "Coba lagi nanti.");
      },
    });
    const job = runner.enqueue({ kind: "flaky" });
    await runner.idle();
    expect(runner.get(job.id)?.state).toBe("failed");

    runner.retry(job.id);
    await runner.idle();
    expect(runner.get(job.id)).toMatchObject({
      state: "succeeded",
      attempts: 2,
      error: null,
    });

    expect(() => runner.retry(job.id)).toThrow(AppError);
  });
});

describe("pembatalan", () => {
  it("membatalkan job yang masih antre tanpa menjalankannya", async () => {
    const gate = deferred();
    let ran = 0;
    const runner = newRunner({
      block: () => gate.promise,
      other: async () => {
        ran += 1;
      },
    });
    runner.enqueue({ kind: "block" });
    const queued = runner.enqueue({ kind: "other" });
    expect(runner.cancel(queued.id)?.state).toBe("cancelled");
    gate.resolve();
    await runner.idle();
    expect(ran).toBe(0);
    expect(runner.get(queued.id)?.state).toBe("cancelled");
  });

  it("mengirim sinyal ke job yang sedang berjalan", async () => {
    const started = deferred();
    const runner = newRunner({
      loop: async ({ signal }) => {
        started.resolve();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve()),
        );
      },
    });
    const job = runner.enqueue({ kind: "loop" });
    await started.promise;
    runner.cancel(job.id);
    await runner.idle();
    expect(runner.get(job.id)?.state).toBe("cancelled");
  });

  it("menandai cancelled walau handler melempar galat setelah dibatalkan", async () => {
    const started = deferred();
    const runner = newRunner({
      loop: async ({ signal }) => {
        started.resolve();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve()),
        );
        throw new DOMException("dibatalkan", "AbortError");
      },
    });
    const job = runner.enqueue({ kind: "loop" });
    await started.promise;
    runner.cancel(job.id);
    await runner.idle();
    expect(runner.get(job.id)).toMatchObject({ state: "cancelled", error: null });
  });
});

describe("pemulihan setelah restart", () => {
  it("melanjutkan dari progres tersimpan dan tidak mengulang langkah yang selesai", async () => {
    const output: number[] = [];

    // Proses pertama: menyelesaikan 2 langkah lalu "mati" (tidak pernah selesai).
    const hang = deferred();
    const firstProcess = newRunner({
      count: async (ctx) => {
        for (let step = 1; step <= 2; step++) {
          output.push(step);
          ctx.progress({ phase: `langkah ${step}`, done: step, total: 4 });
        }
        await hang.promise;
      },
    });
    const job = firstProcess.enqueue({ kind: "count", planId: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(createJobRepo(handle.db).get(job.id)).toMatchObject({
      state: "running",
      progress: { done: 2 },
    });

    // Proses kedua: runner baru di database yang sama.
    const secondProcess = newRunner({ count: countingHandler(output) });
    expect(secondProcess.recover()).toBe(1);
    await secondProcess.idle();

    expect(output).toEqual([1, 2, 3, 4]); // 1-2 tidak diulang
    expect(secondProcess.get(job.id)).toMatchObject({ state: "succeeded", attempts: 2 });
    hang.resolve();
    await firstProcess.idle();
  });

  it("menandai failed job yang berulang kali membuat proses mati", () => {
    const repo = createJobRepo(handle.db);
    const stuck = repo.insert({ kind: "count", planId: null, payload: {} });
    handle.db
      .update(jobs)
      .set({ state: "running", attempts: MAX_JOB_ATTEMPTS })
      .where(eq(jobs.id, stuck.id))
      .run();

    const runner = newRunner({ count: async () => undefined });
    expect(runner.recover()).toBe(0);
    expect(runner.get(stuck.id)).toMatchObject({ state: "failed" });
    expect(runner.get(stuck.id)?.error).toMatch(/terhenti berulang kali/);
  });

  it("menandai failed job yang jenisnya tidak dikenal versi ini", async () => {
    const repo = createJobRepo(handle.db);
    const orphan = repo.insert({ kind: "lama", planId: null, payload: {} });

    const runner = newRunner({ baru: async () => undefined });
    runner.recover();
    expect(runner.get(orphan.id)?.state).toBe("queued"); // belum dikenali sampai dijalankan
    // job antre dari versi lama ikut diproses begitu ada job baru memicu antrean
    runner.enqueue({ kind: "baru" });
    await runner.idle();
    expect(runner.get(orphan.id)).toMatchObject({ state: "failed" });
    expect(runner.get(orphan.id)?.error).toMatch(/tidak dikenali/);
  });

  it("recover tidak menyentuh job yang masih berjalan di proses ini", async () => {
    const gate = deferred();
    const runner = newRunner({ work: () => gate.promise });
    const job = runner.enqueue({ kind: "work" });
    await Promise.resolve();
    await Promise.resolve();
    expect(runner.recover()).toBe(0);
    expect(runner.get(job.id)?.state).toBe("running");
    gate.resolve();
    await runner.idle();
  });
});

describe("pencarian dan langganan", () => {
  it("latestFor mengembalikan job terbaru untuk plan dan jenis", async () => {
    const { plans, users, workspaces } = await import("@/server/db/schema");
    const user = handle.db
      .insert(users)
      .values({ email: "a@b.c", passwordHash: "x", name: "A" })
      .returning()
      .get();
    const ws = handle.db
      .insert(workspaces)
      .values({ userId: user.id, name: "W" })
      .returning()
      .get();
    const plan = handle.db
      .insert(plans)
      .values({ userId: user.id, workspaceId: ws.id, idea: "i" })
      .returning()
      .get();

    const runner = newRunner({ a: async () => undefined, b: async () => undefined });
    runner.enqueue({ kind: "a", planId: plan.id });
    await runner.idle();
    const second = runner.enqueue({ kind: "a", planId: plan.id });
    await runner.idle();
    runner.enqueue({ kind: "b", planId: plan.id });
    await runner.idle();

    expect(runner.latestFor(plan.id, "a")?.id).toBe(second.id);
    expect(runner.latestFor(plan.id)?.kind).toBe("b");
    expect(runner.latestFor("tidak-ada")).toBeUndefined();
  });

  it("subscribe menyaring per job dan berhenti setelah unsubscribe", async () => {
    let calls = 0;
    const runner = newRunner({
      flaky: async () => {
        calls += 1;
        if (calls === 1) throw new AppError("UPSTREAM_AI", "gagal dulu");
      },
    });
    const seen: string[] = [];
    const first = runner.enqueue({ kind: "flaky", payload: { n: 1 } });
    const unsubscribe = runner.subscribe((e) => seen.push(e.jobId), { jobId: first.id });
    await runner.idle();
    const other = runner.enqueue({ kind: "flaky", payload: { n: 2 } });
    await runner.idle();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((id) => id === first.id)).toBe(true);
    expect(seen).not.toContain(other.id);

    unsubscribe();
    const count = seen.length;
    runner.retry(first.id);
    await runner.idle();
    expect(runner.get(first.id)?.state).toBe("succeeded");
    expect(seen.length).toBe(count);
  });

  it("pendengar yang melempar galat tidak mengganggu job", async () => {
    const runner = newRunner({ work: async () => undefined });
    runner.subscribe(() => {
      throw new Error("pendengar rusak");
    });
    const job = runner.enqueue({ kind: "work" });
    await runner.idle();
    expect(runner.get(job.id)?.state).toBe("succeeded");
  });
});
