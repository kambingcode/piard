import { describe, expect, it } from "vitest";
import { readNdjson } from "@/lib/ndjson";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const out: unknown[] = [];
  for await (const value of readNdjson(streamOf(chunks))) out.push(value);
  return out;
}

describe("readNdjson", () => {
  it("menyambung baris yang terpotong antar potongan", async () => {
    expect(await collect(['{"a":', '1}\n{"b"', ":2}\n"])).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("membaca baris terakhir tanpa newline dan melewati baris rusak atau kosong", async () => {
    expect(await collect(['{"a":1}\n\nbukan json\n', '{"c":3}'])).toEqual([
      { a: 1 },
      { c: 3 },
    ]);
  });

  it("karakter multibyte yang terbelah tetap utuh", async () => {
    const bytes = new TextEncoder().encode('{"t":"é"}\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 8));
        controller.enqueue(bytes.slice(8));
        controller.close();
      },
    });
    const out: unknown[] = [];
    for await (const value of readNdjson(stream)) out.push(value);
    expect(out).toEqual([{ t: "é" }]);
  });
});
