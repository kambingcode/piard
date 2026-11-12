"use client";

import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { patternCopy } from "@/components/patterns/copy";
import { cn } from "@/lib/cn";
import { MermaidDiagram } from "./mermaid-diagram";

// Tipe pohon HAST lewat react-markdown, tanpa bergantung langsung pada @types/hast.
type Element = NonNullable<ExtraProps["node"]>;
type ElementContent = Element["children"][number];

function textOf(nodes: ElementContent[]): string {
  return nodes
    .map((n) =>
      n.type === "text" ? n.value : n.type === "element" ? textOf(n.children) : "",
    )
    .join("");
}

/** Elemen `<code class="language-mermaid">` di dalam `<pre>`, bila ada. */
function mermaidSource(pre: Element | undefined): string | undefined {
  const code = pre?.children.find((c): c is Element => c.type === "element");
  const classes = code?.properties.className;
  const isMermaid = Array.isArray(classes) && classes.includes("language-mermaid");
  return code && isMermaid ? textOf(code.children).trim() : undefined;
}

type HeadingTag = "h2" | "h3" | "h4" | "h5" | "h6";
const TAGS: HeadingTag[] = ["h2", "h3", "h4", "h5", "h6"];
/** Tag untuk judul HTML `level` setelah digeser; tidak pernah h1 (milik halaman) atau lebih dari h6. */
const tag = (level: number, offset: number): HeadingTag =>
  TAGS[Math.max(0, Math.min(level - 2 + offset, TAGS.length - 1))] ?? "h6";

/**
 * Tipografi dokumen dari token. Judul Markdown digeser `offset` tingkat (bawaan 1: # → h2) karena
 * halaman sudah punya satu h1; potongan di dalam bagian ber-h2 memakai offset 0 (### → h3).
 */
function components(streaming: boolean, offset: number): Components {
  const H1 = tag(1 + 1, offset - 1);
  const H2 = tag(2 + 1, offset - 1);
  const H3 = tag(3 + 1, offset - 1);
  const H4 = tag(4 + 1, offset - 1);
  return {
    h1: ({ children }) => (
      <H1 className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance">
        {children}
      </H1>
    ),
    h2: ({ children }) => (
      <H2 className="mt-10 text-lg font-semibold tracking-[-0.01em]">{children}</H2>
    ),
    h3: ({ children }) => <H3 className="mt-6 text-base font-semibold">{children}</H3>,
    h4: ({ children }) => <H4 className="mt-4 text-sm font-semibold">{children}</H4>,
    p: ({ children }) => <p className="mt-3 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-6">{children}</ul>,
    ol: ({ children }) => (
      <ol className="mt-3 list-decimal space-y-1.5 pl-6 marker:tabular">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="pl-1 leading-relaxed [&>ol]:mt-1.5 [&>ul]:mt-1.5">{children}</li>
    ),
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-accent underline underline-offset-4"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    blockquote: ({ children }) => (
      <blockquote className="mt-4 border-l-2 border-control-border pl-4 text-muted-foreground">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-8 border-border" />,
    table: ({ children }) => (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-control-border px-3 py-2 text-left font-medium text-muted-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-border px-3 py-2 align-top">{children}</td>
    ),
    pre: ({ node, children }) => {
      const source = mermaidSource(node);
      // Selama mengalir diagram belum tentu lengkap: tampilkan sumbernya, gambar setelah selesai.
      if (source !== undefined && !streaming) return <MermaidDiagram source={source} />;
      return (
        <pre className="mt-4 overflow-x-auto rounded-control bg-muted p-4 font-mono text-[13px] leading-relaxed">
          {children}
        </pre>
      );
    },
    code: ({ children, className }) =>
      className ? (
        <code className={className}>{children}</code>
      ) : (
        <code className="rounded-chip bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
          {children}
        </code>
      ),
  };
}

const VARIANTS = {
  static: [components(false, 0), components(false, 1)],
  streaming: [components(true, 0), components(true, 1)],
} as const;

/**
 * PRD sebagai dokumen: Markdown (GFM), diagram mermaid digambar setelah teks selesai. Selama
 * mengalir pembaca layar tidak diberi tiap potongan (`aria-busy`), lalu satu pengumuman saat selesai.
 */
export function PrdMarkdown({
  content,
  streaming = false,
  headingOffset = 1,
  className,
}: {
  content: string;
  streaming?: boolean;
  /** 1: `#` → h2 (dokumen utuh); 0: `###` → h3 (potongan di bawah h2, mis. spesifikasi fitur). */
  headingOffset?: 0 | 1;
  className?: string;
}) {
  return (
    <div className={cn("text-[15px] text-foreground", className)}>
      <div aria-busy={streaming} className="break-words [&>*:first-child]:mt-0">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={VARIANTS[streaming ? "streaming" : "static"][headingOffset]}
        >
          {content}
        </Markdown>
        {streaming ? <span className="stream-caret" aria-hidden /> : null}
      </div>
      <output className="sr-only">
        {!streaming && content ? patternCopy.streaming.finished : ""}
      </output>
    </div>
  );
}
