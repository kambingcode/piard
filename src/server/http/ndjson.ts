import "server-only";

import { getLogger } from "@/server/logger";

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
} as const;

/**
 * Mengalirkan event sebagai JSON per baris (NDJSON) dalam respons `POST`. Dipakai chat revisi:
 * berbeda dari SSE (`GET`), permintaannya membawa badan dan alirannya berakhir sendiri.
 * Klien yang putus menghentikan iterator (`return()`), sehingga blok `finally` pemanggil berjalan.
 */
export function ndjsonResponse(events: AsyncIterable<unknown>): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
      } catch (error) {
        // Pemanggil seharusnya sudah mengubah galat menjadi event; ini jaring pengaman terakhir.
        getLogger("ndjson").error("aliran NDJSON gagal", { error });
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
  return new Response(body, { headers: NDJSON_HEADERS });
}
