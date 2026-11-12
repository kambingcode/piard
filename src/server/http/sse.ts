import "server-only";

import { getLogger } from "@/server/logger";

/** Peta nama event ke bentuk datanya, mis. `{ job: JobEvent; task: TaskEvent }`. */
export type SseEventMap = Record<string, unknown>;

export type SseStream<TEvents extends SseEventMap> = {
  /** Mengirim satu event. Diabaikan bila koneksi sudah tutup. */
  send<K extends keyof TEvents & string>(event: K, data: TEvents[K]): void;
  /** Menutup aliran dari sisi server. */
  close(): void;
  readonly closed: boolean;
};

/** Cleanup dijalankan tepat sekali saat aliran berakhir (klien putus atau `close()`). */
export type SseCleanup = () => void;

/** Interval komentar `: ping` agar proxy dan browser tidak memutus koneksi yang diam. */
export const SSE_HEARTBEAT_MS = 15_000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/** Memformat satu event SSE. Data selalu JSON satu baris sehingga tidak perlu memecah baris. */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Membuka respons Server-Sent Events.
 *
 * @param signal Biasanya `request.signal`; aliran ditutup saat klien putus.
 * @param setup Dipanggil sekali dengan aliran; boleh mengembalikan fungsi cleanup
 *   (mis. berhenti berlangganan progres job).
 */
export function sseResponse<TEvents extends SseEventMap>(
  signal: AbortSignal,
  setup: (
    stream: SseStream<TEvents>,
  ) => SseCleanup | undefined | Promise<SseCleanup | undefined>,
): Response {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cleanup: SseCleanup | undefined;
  let closed = false;

  const write = (chunk: string) => {
    if (closed) return;
    try {
      controller?.enqueue(encoder.encode(chunk));
    } catch {
      // Konsumen sudah pergi di antara pengecekan `closed` dan penulisan.
      finish();
    }
  };

  function finish() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    signal.removeEventListener("abort", finish);
    try {
      cleanup?.();
    } catch (error) {
      getLogger("sse").warn("cleanup SSE gagal", { error });
    }
    try {
      controller?.close();
    } catch {
      // Sudah ditutup oleh konsumen.
    }
  }

  const stream: SseStream<TEvents> = {
    send: (event, data) => write(formatSseEvent(event, data)),
    close: finish,
    get closed() {
      return closed;
    },
  };

  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      controller = c;
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) return finish();

      write(": terhubung\n\n");
      heartbeat = setInterval(() => write(": ping\n\n"), SSE_HEARTBEAT_MS);
      try {
        const registered = await setup(stream);
        if (closed) registered?.();
        else cleanup = registered;
      } catch (error) {
        getLogger("sse").error("setup SSE gagal", { error });
        finish();
      }
    },
    cancel: finish,
  });

  return new Response(body, { headers: SSE_HEADERS });
}
