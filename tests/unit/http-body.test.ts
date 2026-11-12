import { describe, expect, it } from "vitest";
import { readBodyLimited } from "@/server/http/body";
import { AppError } from "@/server/http/errors";

const messages = { tooLarge: "terlalu besar", empty: "kosong" };

/** Permintaan berbadan aliran tanpa `Content-Length`, dipotong per `chunk` byte. */
function streamed(total: number, chunk: number, onPull?: () => void): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (sent >= total) return controller.close();
      const size = Math.min(chunk, total - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size).fill(7));
    },
  });
  return new Request("http://localhost/x", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
}

async function rejection(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    return error as AppError;
  }
  throw new Error("diharapkan galat");
}

describe("readBodyLimited", () => {
  it("membaca badan dalam batas", async () => {
    const body = await readBodyLimited(
      new Request("http://localhost/x", {
        method: "POST",
        body: new Uint8Array([1, 2, 3]),
      }),
      10,
      messages,
    );
    expect([...body]).toEqual([1, 2, 3]);
    expect((await readBodyLimited(streamed(25, 4), 25, messages)).length).toBe(25);
  });

  it("menolak lebih awal bila Content-Length melebihi batas (413)", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: new Uint8Array(20),
      headers: { "content-length": "20" },
    });
    const error = await rejection(readBodyLimited(request, 10, messages));
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(413);
    expect(error.message).toBe("terlalu besar");
  });

  it("menghitung badan aliran tanpa header dan berhenti membaca begitu batas terlewati", async () => {
    let pulls = 0;
    const error = await rejection(
      readBodyLimited(
        streamed(1_000_000, 100, () => pulls++),
        1_000,
        messages,
      ),
    );
    expect(error.status).toBe(413);
    // Berhenti setelah ±11 potongan, bukan membaca 10.000 potongan.
    expect(pulls).toBeLessThan(20);
  });

  it("badan kosong ditolak (400)", async () => {
    const none = await rejection(
      readBodyLimited(
        new Request("http://localhost/x", { method: "POST" }),
        10,
        messages,
      ),
    );
    expect(none.status).toBe(400);
    expect(none.message).toBe("kosong");
    const zero = await rejection(
      readBodyLimited(
        new Request("http://localhost/x", { method: "POST", body: new Uint8Array(0) }),
        10,
        messages,
      ),
    );
    expect(zero.status).toBe(400);
  });
});
