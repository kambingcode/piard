"use client";

import { useEffect, useRef } from "react";

/** Peta nama event SSE ke bentuk datanya, sama dengan `SseEventMap` di server. */
export type EventHandlers<TEvents extends Record<string, unknown>> = {
  [K in keyof TEvents]?: (data: TEvents[K]) => void;
};

/**
 * Berlangganan Server-Sent Events bertipe selama `url` tidak null. Browser menyambung ulang sendiri
 * bila koneksi putus; handler terbaru selalu dipakai tanpa membuka koneksi baru. Data yang bukan JSON
 * diabaikan.
 */
export function useEventSource<TEvents extends Record<string, unknown>>(
  url: string | null,
  handlers: EventHandlers<TEvents>,
): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  const names = Object.keys(handlers).sort().join(",");

  useEffect(() => {
    if (!url) return;
    const source = new EventSource(url);
    const listeners = names
      .split(",")
      .filter(Boolean)
      .map((name) => {
        const listener = (event: MessageEvent<string>) => {
          let data: unknown;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          // Bentuk data dijamin kontrak event server (SseStream<TEvents>).
          (latest.current[name] as ((value: unknown) => void) | undefined)?.(data);
        };
        source.addEventListener(name, listener);
        return [name, listener] as const;
      });
    return () => {
      for (const [name, listener] of listeners)
        source.removeEventListener(name, listener);
      source.close();
    };
  }, [url, names]);
}
