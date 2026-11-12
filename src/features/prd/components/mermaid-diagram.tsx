"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { prdCopy } from "../copy";

const copy = prdCopy.diagram;
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeScheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Tema sistem; bagian halaman yang dipaksa `data-theme` ditangani di `effectiveDark`. */
function useSystemDark(): boolean {
  return useSyncExternalStore(
    subscribeScheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

function effectiveDark(element: Element | null, systemDark: boolean): boolean {
  const forced = element?.closest("[data-theme]")?.getAttribute("data-theme");
  return forced ? forced === "dark" : systemDark;
}

// mermaid memakai satu konfigurasi global; render bergiliran agar tema dan id tidak bertabrakan.
let queue: Promise<unknown> = Promise.resolve();

async function renderDiagram(id: string, source: string, dark: boolean): Promise<string> {
  const run = queue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "neutral",
      fontFamily: "inherit",
    });
    // parse lebih dulu: render yang gagal meninggalkan elemen galat di <body>.
    await mermaid.parse(source);
    const { svg } = await mermaid.render(id, source);
    return svg;
  });
  queue = run.catch(() => undefined);
  return run;
}

type Result = { svg: string } | { error: true } | null;

/** Diagram mermaid; bila sumbernya tidak valid, sumber ditampilkan tanpa merusak halaman. */
export function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId();
  const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const systemDark = useSystemDark();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [result, setResult] = useState<Result>(null);
  const kind = /^\s*(\w+)/.exec(source)?.[1] ?? "mermaid";

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    renderDiagram(id, source, effectiveDark(host, systemDark)).then(
      (svg) => {
        if (!cancelled) setResult({ svg });
      },
      () => {
        if (!cancelled) setResult({ error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [host, id, source, systemDark]);

  if (result && "error" in result) {
    return (
      <figure className="my-6">
        <figcaption className="mb-2 text-sm text-negative">{copy.invalid}</figcaption>
        <pre className="overflow-x-auto rounded-control bg-muted p-4 font-mono text-[13px] leading-relaxed">
          <code>{source}</code>
        </pre>
      </figure>
    );
  }

  return (
    <figure
      ref={setHost}
      aria-label={copy.label(kind)}
      aria-busy={result === null}
      className="my-6 overflow-x-auto rounded-card border border-border bg-card p-4"
    >
      {result ? (
        <div
          // Label panah tema gelap mermaid kontrasnya kurang dari AA (axe); dipaksa memakai token.
          className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full [&_.edgeLabel]:bg-card! [&_.edgeLabel_p]:bg-card! [&_.edgeLabel_p]:text-foreground! [&_.labelBkg]:bg-card!"
          // SVG dari mermaid dengan securityLevel "strict" (sudah disanitasi DOMPurify).
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG mermaid tersanitasi
          dangerouslySetInnerHTML={{ __html: result.svg }}
        />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">{copy.rendering}</p>
      )}
    </figure>
  );
}
