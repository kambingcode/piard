import "server-only";

import type { z } from "zod";
import { getLogger } from "@/server/logger";
import { readBodyLimited } from "./body";
import {
  AppError,
  toErrorResponse,
  ValidationError,
  type ValidationIssue,
} from "./errors";

type Schema = z.ZodType;

/** Skema opsional untuk tiap bagian permintaan. Yang tidak diberikan tidak diparse. */
export type RouteSchemas = { body?: Schema; query?: Schema; params?: Schema };

type Parsed<S, K extends keyof RouteSchemas> = S extends {
  [P in K]: infer T extends Schema;
}
  ? z.output<T>
  : undefined;

export type RouteContext<TUser, S extends RouteSchemas> = {
  request: Request;
  user: TUser;
  body: Parsed<S, "body">;
  query: Parsed<S, "query">;
  params: Parsed<S, "params">;
};

/** Argumen kedua yang diberikan Next ke route handler. */
type NextRouteContext = { params: Promise<Record<string, string | string[]>> };

/** `session` = butuh cookie sesi (401 tanpa sesi); `agent` = token Bearer agen (ADR 0017); `public` = terbuka. */
export type RouteAccess = "session" | "agent" | "public";

export type RouteBuilderOptions = {
  /** Batas badan JSON dalam byte (dihitung saat dibaca, bukan percaya `Content-Length`). */
  maxBodyBytes?: number;
  tooLargeMessage?: string;
};

/** Metadata route untuk `docs/api.md`. Dibaca generator (`pnpm docs:api`), tidak dipakai saat runtime. */
export type RouteDoc = { access: RouteAccess; schemas: RouteSchemas };

export type RouteHandler = ((
  request: Request,
  context: NextRouteContext,
) => Promise<Response>) & { routeDoc: RouteDoc };

const log = () => getLogger("http");

/** Respons API berisi data pengguna: tidak boleh disimpan cache browser maupun perantara. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function parseWith<T extends Schema>(
  schema: T,
  input: unknown,
  what: string,
): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = toIssues(result.error);
  const first = issues[0];
  const detail = first
    ? `${first.path ? `${first.path}: ` : ""}${first.message}`
    : "tidak valid";
  throw new ValidationError(`${what} tidak valid (${detail}).`, issues);
}

const PAYLOAD_TOO_LARGE = 413;

async function readJson(
  request: Request,
  options: RouteBuilderOptions,
): Promise<unknown> {
  let text: string;
  if (options.maxBodyBytes === undefined) {
    text = await request.text();
  } else {
    const tooLarge = options.tooLargeMessage ?? "Isi permintaan terlalu besar.";
    try {
      const bytes = await readBodyLimited(request, options.maxBodyBytes, {
        tooLarge,
        empty: "",
      });
      text = new TextDecoder().decode(bytes);
    } catch (error) {
      // Badan kosong sah di sini (mis. POST klaim tanpa badan); hanya "terlalu besar" yang diteruskan.
      if (error instanceof AppError && error.status === PAYLOAD_TOO_LARGE) throw error;
      text = "";
    }
  }
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new AppError("VALIDATION", "Isi permintaan bukan JSON yang valid.", 400, cause);
  }
}

/**
 * Membuat pembangun route dengan aturan autentikasi tertentu.
 *
 * Route yang dihasilkan: (1) memastikan pengguna lewat `authenticate`, (2) memvalidasi
 * params/query/body dengan Zod, (3) memanggil `handler`, (4) mengubah hasilnya menjadi
 * JSON (atau meneruskan `Response`), (5) memetakan galat menjadi `{error, code}`.
 * Handler cukup memanggil service dan tidak berisi logika bisnis.
 *
 * @param authenticate Melempar `AppError("UNAUTHORIZED")` bila tidak ada sesi yang sah.
 * @param access Dicatat di `routeDoc` untuk dokumentasi API.
 * @param options Batas badan untuk route yang dipanggil mesin (API agen).
 */
export function createRouteBuilder<TUser>(
  authenticate: (request: Request) => Promise<TUser>,
  access: RouteAccess,
  options: RouteBuilderOptions = {},
) {
  return function route<const S extends RouteSchemas = Record<never, never>>(
    schemas: S,
    handler: (ctx: RouteContext<TUser, S>) => Promise<unknown>,
  ): RouteHandler {
    const routeDoc: RouteDoc = { access, schemas };
    const run = async (
      request: Request,
      context: NextRouteContext,
    ): Promise<Response> => {
      try {
        const user = await authenticate(request);
        const ctx = {
          request,
          user,
          params: schemas.params
            ? parseWith(schemas.params, await context.params, "Parameter alamat")
            : undefined,
          query: schemas.query
            ? parseWith(
                schemas.query,
                Object.fromEntries(new URL(request.url).searchParams),
                "Parameter query",
              )
            : undefined,
          body: schemas.body
            ? parseWith(schemas.body, await readJson(request, options), "Isi permintaan")
            : undefined,
        } as RouteContext<TUser, S>; // Parsed<> dijamin cocok dengan skema oleh cabang di atas.

        const result = await handler(ctx);
        if (result instanceof Response) return result;
        if (result === undefined) return new Response(null, { status: 204 });
        return Response.json(result, { headers: NO_STORE });
      } catch (error) {
        return errorResponse(request, error);
      }
    };
    return Object.assign(run, { routeDoc });
  };
}

function errorResponse(request: Request, error: unknown): Response {
  const { status, body } = toErrorResponse(error);
  const where = `${request.method} ${new URL(request.url).pathname}`;
  if (status >= 500) log().error("route gagal", { where, error });
  else log().debug("route menolak permintaan", { where, status, code: body.code });
  return Response.json(body, { status, headers: NO_STORE });
}

/** Route tanpa autentikasi (mis. health check, sign-in). */
export const publicRoute = createRouteBuilder(async () => undefined, "public");
