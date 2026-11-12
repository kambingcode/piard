import { afterEach, describe, expect, it, vi } from "vitest";
import { formatSseEvent, SSE_HEARTBEAT_MS, sseResponse } from "@/server/http/sse";

type Events = { job: { phase: string; done: number }; task: { id: string } };

afterEach(() => vi.useRealTimers());

async function readAll(response: Response): Promise<string> {
  return await response.text();
}

describe("formatSseEvent", () => {
  it("menulis event dan data JSON satu baris", () => {
    expect(formatSseEvent("job", { phase: "a\nb", done: 1 })).toBe(
      'event: job\ndata: {"phase":"a\\nb","done":1}\n\n',
    );
  });
});

describe("sseResponse", () => {
  it("mengirim header SSE dan event bertipe lalu menutup bila server memanggil close()", async () => {
    const controller = new AbortController();
    const response = sseResponse<Events>(controller.signal, (stream) => {
      stream.send("job", { phase: "Membaca PRD", done: 0 });
      stream.send("task", { id: "t1" });
      stream.close();
      return undefined;
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    expect(await readAll(response)).toBe(
      ': terhubung\n\nevent: job\ndata: {"phase":"Membaca PRD","done":0}\n\nevent: task\ndata: {"id":"t1"}\n\n',
    );
  });

  it("menjalankan cleanup tepat sekali saat klien putus", async () => {
    const controller = new AbortController();
    const cleanup = vi.fn();
    const response = sseResponse<Events>(controller.signal, () => cleanup);
    const reader = response.body?.getReader();
    await reader?.read(); // komentar pembuka

    controller.abort();
    expect((await reader?.read())?.done).toBe(true);
    controller.abort();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("menjalankan cleanup bila klien membatalkan pembacaan", async () => {
    const cleanup = vi.fn();
    const response = sseResponse<Events>(new AbortController().signal, () => cleanup);
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("menjalankan cleanup walau stream ditutup sebelum setup async selesai", async () => {
    const cleanup = vi.fn();
    const controller = new AbortController();
    const response = sseResponse<Events>(controller.signal, async () => {
      controller.abort();
      return cleanup;
    });
    await readAll(response);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("langsung menutup bila sinyal sudah batal", async () => {
    const controller = new AbortController();
    controller.abort();
    const setup = vi.fn();
    const response = sseResponse<Events>(controller.signal, setup);
    expect(await readAll(response)).toBe("");
    expect(setup).not.toHaveBeenCalled();
  });

  it("mengabaikan send setelah tutup", async () => {
    let captured: { send: (e: "task", d: { id: string }) => void } | undefined;
    const response = sseResponse<Events>(new AbortController().signal, (stream) => {
      captured = stream;
      stream.close();
      return undefined;
    });
    await readAll(response);
    expect(() => captured?.send("task", { id: "x" })).not.toThrow();
  });

  it("mengirim detak berkala", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const response = sseResponse<Events>(controller.signal, () => undefined);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    await reader?.read();

    await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_MS);
    const beat = await reader?.read();
    expect(decoder.decode(beat?.value)).toBe(": ping\n\n");
    controller.abort();
  });

  it("menutup aliran bila setup melempar galat", async () => {
    const response = sseResponse<Events>(new AbortController().signal, () => {
      throw new Error("gagal");
    });
    expect(await readAll(response)).toBe(": terhubung\n\n");
  });
});
