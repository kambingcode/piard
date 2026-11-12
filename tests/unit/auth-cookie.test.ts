import { describe, expect, it } from "vitest";
import {
  clearedSessionCookie,
  isSecureRequest,
  readCookie,
  readSessionToken,
  SESSION_COOKIE,
  sessionCookie,
} from "@/features/auth/server/cookie";

const req = (headers: Record<string, string>, url = "http://localhost:3000/api/x") =>
  new Request(url, { headers });

describe("readCookie", () => {
  it("membaca cookie bernama di antara cookie lain", () => {
    expect(readCookie("a=1; piard_session=abc%2Fdef; b=2", "piard_session")).toBe(
      "abc/def",
    );
  });

  it("mengembalikan undefined bila tidak ada atau header kosong", () => {
    expect(readCookie(null, "x")).toBeUndefined();
    expect(readCookie("a=1", "x")).toBeUndefined();
    expect(
      readCookie("rusak-tanpa-sama-dengan", "rusak-tanpa-sama-dengan"),
    ).toBeUndefined();
  });

  it("menganggap cookie dengan escape rusak sebagai tidak ada, bukan melempar galat", () => {
    expect(() => readCookie("piard_session=%E0%A4%A", SESSION_COOKIE)).not.toThrow();
    expect(readCookie("piard_session=%E0%A4%A", SESSION_COOKIE)).toBeUndefined();
    expect(readSessionToken(req({ cookie: "piard_session=%" }))).toBeUndefined();
  });

  it("tidak tertukar oleh cookie berawalan sama", () => {
    expect(readCookie("piard_session_lama=x", SESSION_COOKIE)).toBeUndefined();
  });

  it("readSessionToken membaca dari Request", () => {
    expect(readSessionToken(req({ cookie: `${SESSION_COOKIE}=tok` }))).toBe("tok");
    expect(readSessionToken(req({}))).toBeUndefined();
  });
});

describe("isSecureRequest", () => {
  it("true untuk https langsung atau lewat proxy yang meneruskan skema", () => {
    expect(isSecureRequest(req({}, "https://piard.example/api"))).toBe(true);
    expect(isSecureRequest(req({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(isSecureRequest(req({ "x-forwarded-proto": "https, http" }))).toBe(true);
  });

  it("false untuk http lokal", () => {
    expect(isSecureRequest(req({}))).toBe(false);
    expect(isSecureRequest(req({ "x-forwarded-proto": "http" }, "https://x/api"))).toBe(
      false,
    );
  });
});

describe("header Set-Cookie", () => {
  it("sesi: HttpOnly, SameSite=Lax, Path=/, dengan masa berlaku", () => {
    const expires = new Date(Date.now() + 3600_000);
    const header = sessionCookie("tok/en", expires, { secure: false });
    expect(header).toContain(`${SESSION_COOKIE}=tok%2Fen`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toMatch(/Max-Age=(3599|3600)/);
    expect(header).not.toContain("Secure");
  });

  it("menambah Secure bila diminta", () => {
    expect(sessionCookie("t", new Date(Date.now() + 1000), { secure: true })).toContain(
      "Secure",
    );
  });

  it("tidak pernah memberi Max-Age negatif", () => {
    expect(sessionCookie("t", new Date(0), { secure: false })).toContain("Max-Age=0");
  });

  it("menghapus cookie dengan Max-Age=0", () => {
    const header = clearedSessionCookie({ secure: false });
    expect(header).toContain(`${SESSION_COOKIE}=;`);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("HttpOnly");
  });
});
