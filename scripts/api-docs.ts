/**
 * Pembuat docs/api.md dari route handler dan skema Zod-nya (doc 09 bagian 6: "dibuat otomatis agar
 * tidak usang"). Dipakai `pnpm docs:api` (menulis berkas) dan tests/contract/api-docs.test.ts (gagal
 * bila berkas tertinggal dari kode).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ERROR_CODES } from "@/lib/api-error";
import { DEFAULT_STATUS } from "@/server/http/errors";
import type { RouteDoc, RouteSchemas } from "@/server/http/route";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

export type ApiRoute = {
  path: string;
  method: Method;
  description: string;
  doc: RouteDoc;
};

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** `src/app/api/plan/[id]/route.ts` → `/api/plan/:id`. */
function urlPath(apiDir: string, file: string): string {
  const parts = relative(apiDir, file).split(sep).slice(0, -1);
  return `/api/${parts.map((p) => p.replace(/^\[(.+)\]$/, ":$1")).join("/")}`;
}

/** TSDoc tepat di atas `export const METHOD`, dirapikan menjadi satu paragraf. */
function descriptions(source: string): Partial<Record<Method, string>> {
  const found: Partial<Record<Method, string>> = {};
  for (const match of source.matchAll(
    /\/\*\*([\s\S]*?)\*\/\s*export const (GET|POST|PUT|PATCH|DELETE)\b/g,
  )) {
    const [, body = "", method] = match;
    const text = body
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trim())
      .filter(Boolean)
      .join(" ");
    found[method as Method] = text;
  }
  return found;
}

function hasRouteDoc(value: unknown): value is { routeDoc: RouteDoc } {
  return typeof value === "function" && "routeDoc" in value;
}

/** Semua route di `apiDir`, urut alamat lalu metode. Route tanpa `routeDoc` membuat galat. */
export async function collectRoutes(apiDir = join(process.cwd(), "src/app/api")) {
  const routes: ApiRoute[] = [];
  for (const file of routeFiles(apiDir)) {
    const mod: Record<string, unknown> = await import(pathToFileURL(file).href);
    const comments = descriptions(readFileSync(file, "utf8"));
    for (const method of METHODS) {
      const handler = mod[method];
      if (handler === undefined) continue;
      if (!hasRouteDoc(handler)) {
        throw new Error(`${file}: ${method} tidak dibuat dengan authedRoute/publicRoute`);
      }
      routes.push({
        path: urlPath(apiDir, file),
        method,
        description: comments[method] ?? "",
        doc: handler.routeDoc,
      });
    }
  }
  return routes.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      METHODS.indexOf(a.method) - METHODS.indexOf(b.method),
  );
}

function constraints(s: JsonSchema): string[] {
  // Batasan di dalam union (mis. `number | null` dengan minimum) tetap ditampilkan.
  const out: string[] = (s.anyOf ?? s.oneOf ?? []).flatMap(constraints);
  if (s.minLength !== undefined && s.maxLength !== undefined)
    out.push(`${s.minLength}-${s.maxLength} karakter`);
  else if (s.minLength !== undefined) out.push(`min ${s.minLength} karakter`);
  else if (s.maxLength !== undefined) out.push(`maks ${s.maxLength} karakter`);
  if (s.minItems !== undefined) out.push(`min ${s.minItems} item`);
  if (s.maxItems !== undefined) out.push(`maks ${s.maxItems} item`);
  if (s.minimum !== undefined) out.push(`≥ ${s.minimum}`);
  if (s.exclusiveMinimum !== undefined) out.push(`> ${s.exclusiveMinimum}`);
  if (s.maximum !== undefined && s.maximum < Number.MAX_SAFE_INTEGER)
    out.push(`≤ ${s.maximum}`);
  if (s.exclusiveMaximum !== undefined) out.push(`< ${s.exclusiveMaximum}`);
  if (s.format && s.format !== "regex") out.push(s.format);
  if (s.pattern && !s.format) out.push(`pola ${s.pattern}`);
  if (s.default !== undefined) out.push(`bawaan ${JSON.stringify(s.default)}`);
  if (s.description) out.push(s.description);
  return out;
}

/** JSON Schema → notasi tipe TypeScript yang mudah dibaca. */
function tsType(s: JsonSchema, indent: string): string {
  const variants = s.anyOf ?? s.oneOf;
  if (variants) return variants.map((v) => tsType(v, indent)).join(" | ");
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  const type = Array.isArray(s.type) ? s.type : [s.type];
  return type
    .map((t) => {
      switch (t) {
        case "object": {
          const props = Object.entries(s.properties ?? {});
          if (props.length === 0) {
            return typeof s.additionalProperties === "object"
              ? `Record<string, ${tsType(s.additionalProperties, indent)}>`
              : "{}";
          }
          const inner = `${indent}  `;
          const lines = props.map(([key, value]) => {
            const optional = s.required?.includes(key) ? "" : "?";
            const notes = constraints(value);
            const comment = notes.length > 0 ? ` // ${notes.join("; ")}` : "";
            return `${inner}${key}${optional}: ${tsType(value, inner)};${comment}`;
          });
          return `{\n${lines.join("\n")}\n${indent}}`;
        }
        case "array": {
          const item = s.items ? tsType(s.items, indent) : "unknown";
          return /[|{]/.test(item) ? `(${item})[]` : `${item}[]`;
        }
        case "integer":
          return "number";
        case undefined:
          return "unknown";
        default:
          return t;
      }
    })
    .join(" | ");
}

function schemaBlock(title: string, schema: z.ZodType): string {
  const json = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as JsonSchema;
  const notes = constraints(json);
  return [
    `${title}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}:`,
    "",
    "```ts",
    tsType(json, ""),
    "```",
  ].join("\n");
}

const PART_TITLES: Record<keyof RouteSchemas, string> = {
  params: "Parameter alamat",
  query: "Query",
  body: "Isi JSON",
};

function renderRoute(route: ApiRoute): string {
  const access = {
    session: "Butuh sesi.",
    agent: "Butuh token agen (`Authorization: Bearer ppl_…`), bukan sesi.",
    public: "Tanpa sesi.",
  }[route.doc.access];
  const parts = (["params", "query", "body"] as const).flatMap((part) => {
    const schema = route.doc.schemas[part];
    return schema ? [schemaBlock(PART_TITLES[part], schema)] : [];
  });
  return [
    `### \`${route.method} ${route.path}\``,
    "",
    `${access}${route.description ? ` ${route.description}` : ""}`,
    ...parts.flatMap((part) => ["", part]),
  ].join("\n");
}

/** Kelompok = segmen kedua alamat (`/api/plan/tasks/...` → `plan/tasks`). */
function groupOf(path: string): string {
  const segments = path.split("/").slice(2);
  return segments[0] === "plan" && segments.length > 2 && !segments[1]?.startsWith(":")
    ? `plan/${segments[1]}`
    : (segments[0] ?? "");
}

export function renderApiDocs(routes: ApiRoute[]): string {
  const groups = new Map<string, ApiRoute[]>();
  for (const route of routes) {
    const key = groupOf(route.path);
    groups.set(key, [...(groups.get(key) ?? []), route]);
  }
  const errorRows = ERROR_CODES.map(
    (code) => `| \`${code}\` | ${DEFAULT_STATUS[code]} |`,
  );
  const sections = [...groups.entries()].map(([group, items]) =>
    [`## ${group}`, "", items.map(renderRoute).join("\n\n")].join("\n"),
  );
  return `${[
    "# API Piard",
    "",
    "<!-- Dibuat otomatis oleh `pnpm docs:api` dari route handler dan skema Zod. Jangan disunting manual. -->",
    "",
    `${routes.length} endpoint di \`src/app/api\`. Semua menerima dan mengembalikan JSON kecuali disebut lain`,
    "(NDJSON, SSE, unduhan). Sesi berupa cookie `piard_session` dari `POST /api/auth/sign-in`; tanpa sesi",
    'yang sah, endpoint "Butuh sesi" menjawab 401. Respons sukses tanpa isi berstatus 204.',
    "",
    "Galat selalu berbentuk `{ error: string; code: string; issues?: { path: string; message: string }[] }`.",
    "`error` aman ditampilkan ke pengguna; `issues` ada pada `VALIDATION` (per kolom).",
    "",
    "| Kode | Status |",
    "|---|---|",
    ...errorRows,
    "| `INTERNAL` | 500 |",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ]
    .join("\n")
    .trimEnd()}\n`;
}
