import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/server/http/errors";
import { createRouteBuilder, publicRoute } from "@/server/http/route";

const user = { id: "u1" };
const route = createRouteBuilder(async (request) => {
  if (request.headers.get("x-user") !== "ok") {
    throw new AppError("UNAUTHORIZED", "Silakan masuk dulu.");
  }
  return user;
}, "session");

const noParams = { params: Promise.resolve({}) };
const authed = { headers: { "x-user": "ok" } };

function post(body: string, init: RequestInit = authed) {
  return new Request("http://test.local/api/x", { method: "POST", body, ...init });
}

describe("createRouteBuilder", () => {
  it("menolak permintaan tanpa sesi sebelum menyentuh handler", async () => {
    let called = false;
    const handler = route({}, async () => {
      called = true;
    });
    const res = await handler(new Request("http://test.local/api/x"), noParams);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Silakan masuk dulu.",
      code: "UNAUTHORIZED",
    });
    expect(called).toBe(false);
  });

  it("memparse body, query, dan params lalu meneruskan nilai bertipe", async () => {
    const handler = route(
      {
        body: z.object({ idea: z.string().min(1) }),
        query: z.object({ page: z.coerce.number().default(1) }),
        params: z.object({ id: z.string() }),
      },
      async ({ body, query, params, user: u }) => ({
        idea: body.idea,
        page: query.page,
        id: params.id,
        user: u.id,
      }),
    );
    const request = new Request("http://test.local/api/x?page=3", {
      method: "POST",
      headers: authed.headers,
      body: JSON.stringify({ idea: "toko" }),
    });
    const res = await handler(request, { params: Promise.resolve({ id: "p9" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ idea: "toko", page: 3, id: "p9", user: "u1" });
  });

  it("mengembalikan 400 VALIDATION dengan daftar masalah", async () => {
    const handler = route(
      { body: z.object({ idea: z.string().min(1) }) },
      async () => ({}),
    );
    const res = await handler(post(JSON.stringify({ idea: "" })), noParams);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ code: "VALIDATION", issues: [{ path: "idea" }] });
    expect(json.error).toContain("idea");
  });

  it("mengembalikan 400 untuk JSON rusak dan body kosong yang diwajibkan", async () => {
    const handler = route({ body: z.object({ a: z.string() }) }, async () => ({}));
    const broken = await handler(post("{rusak"), noParams);
    expect(broken.status).toBe(400);
    expect((await broken.json()).code).toBe("VALIDATION");

    const empty = await handler(post(""), noParams);
    expect(empty.status).toBe(400);
  });

  it("memetakan AppError dari handler dan menyembunyikan galat tak terduga", async () => {
    const notFound = route({}, async () => {
      throw new AppError("NOT_FOUND", "Plan tidak ditemukan.");
    });
    const res1 = await notFound(post("", authed), noParams);
    expect(res1.status).toBe(404);

    const boom = route({}, async () => {
      throw new Error("kunci rahasia bocor");
    });
    const res2 = await boom(post("", authed), noParams);
    expect(res2.status).toBe(500);
    expect(JSON.stringify(await res2.json())).not.toContain("rahasia");
  });

  it("meneruskan Response apa adanya dan memberi 204 untuk hasil kosong", async () => {
    const passthrough = route({}, async () => new Response("teks", { status: 201 }));
    const res = await passthrough(post("", authed), noParams);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("teks");

    const empty = route({}, async () => undefined);
    expect((await empty(post("", authed), noParams)).status).toBe(204);
  });
});

describe("cache", () => {
  it("respons JSON sukses dan galat sama-sama no-store", async () => {
    const ok = route({}, async () => ({ a: 1 }));
    const fail = route({}, async () => {
      throw new AppError("NOT_FOUND", "tidak ada");
    });
    expect((await ok(post("", authed), noParams)).headers.get("cache-control")).toBe(
      "no-store",
    );
    expect((await fail(post("", authed), noParams)).headers.get("cache-control")).toBe(
      "no-store",
    );
  });
});

describe("publicRoute", () => {
  it("tidak butuh sesi", async () => {
    const handler = publicRoute({}, async () => ({ ok: true }));
    const res = await handler(new Request("http://test.local/api/health"), noParams);
    expect(await res.json()).toEqual({ ok: true });
  });
});
