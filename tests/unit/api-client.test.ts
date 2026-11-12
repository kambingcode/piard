import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, SIGN_IN_PATH } from "@/lib/api-client";

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

function stubWindow() {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  return assign;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiRequest", () => {
  it("mengarahkan ke halaman masuk saat sesi habis (401) di luar endpoint auth", async () => {
    const assign = stubWindow();
    respond(401, { error: "Silakan masuk.", code: "UNAUTHORIZED" });
    const result = await apiRequest("/api/plan/roadmap/generate?planId=x");
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(assign).toHaveBeenCalledWith(SIGN_IN_PATH);
  });

  it("tidak mengalihkan pada 401 endpoint auth (kata sandi salah)", async () => {
    const assign = stubWindow();
    respond(401, { error: "Email atau kata sandi salah.", code: "UNAUTHORIZED" });
    const result = await apiRequest("/api/auth/sign-in", { method: "POST" });
    expect(result.ok).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("tidak mengalihkan pada galat lain", async () => {
    const assign = stubWindow();
    respond(409, { error: "Sedang dibuat.", code: "CONFLICT" });
    const result = await apiRequest("/api/plan/features/create", { method: "POST" });
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(assign).not.toHaveBeenCalled();
  });

  it("galat jaringan menjadi pesan yang bisa dibaca", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("failed");
      }),
    );
    const result = await apiRequest("/api/plan/list");
    expect(result).toMatchObject({ ok: false, status: 0 });
  });
});
