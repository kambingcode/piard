import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  ERROR_CODES,
  INTERNAL_ERROR_MESSAGE,
  toErrorResponse,
  ValidationError,
} from "@/server/http/errors";

describe("AppError", () => {
  it("memakai status bawaan per kode", () => {
    const statuses = Object.fromEntries(
      ERROR_CODES.map((code) => [code, new AppError(code, "x").status]),
    );
    expect(statuses).toEqual({
      NOT_FOUND: 404,
      VALIDATION: 400,
      UNAUTHORIZED: 401,
      BUDGET_EXCEEDED: 429,
      UPSTREAM_AI: 502,
      CONFLICT: 409,
    });
  });

  it("mengizinkan status eksplisit dan menyimpan penyebab", () => {
    const cause = new Error("asal");
    const error = new AppError("CONFLICT", "bentrok", 412, cause);
    expect(error.status).toBe(412);
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("toErrorResponse", () => {
  it("memetakan AppError menjadi {error, code}", () => {
    expect(toErrorResponse(new AppError("NOT_FOUND", "Plan tidak ditemukan."))).toEqual({
      status: 404,
      body: { error: "Plan tidak ditemukan.", code: "NOT_FOUND" },
    });
  });

  it("menyertakan daftar masalah pada ValidationError", () => {
    const issues = [{ path: "idea", message: "wajib diisi" }];
    expect(toErrorResponse(new ValidationError("Isi tidak valid.", issues))).toEqual({
      status: 400,
      body: { error: "Isi tidak valid.", code: "VALIDATION", issues },
    });
  });

  it("menyembunyikan pesan galat tak terduga", () => {
    const result = toErrorResponse(new Error("SQLITE_ERROR: no such table users"));
    expect(result).toEqual({
      status: 500,
      body: { error: INTERNAL_ERROR_MESSAGE, code: "INTERNAL" },
    });
    expect(JSON.stringify(result)).not.toContain("SQLITE");
  });

  it("menangani nilai non-Error", () => {
    expect(toErrorResponse("aneh").status).toBe(500);
    expect(toErrorResponse(undefined).body.code).toBe("INTERNAL");
  });
});

describe("salinan modul lain (graf instrumentation vs route)", () => {
  it("AppError/ValidationError dari salinan modul kedua tetap dikenali, bukan 500", async () => {
    vi.resetModules();
    const other = await import("@/server/http/errors");
    expect(other.AppError).not.toBe(AppError);

    const budget = new other.AppError("BUDGET_EXCEEDED", "Batas biaya tercapai.");
    expect(budget).toBeInstanceOf(AppError);
    expect(toErrorResponse(budget)).toEqual({
      status: 429,
      body: { error: "Batas biaya tercapai.", code: "BUDGET_EXCEEDED" },
    });
    const invalid = new other.ValidationError("Isian tidak valid.", [
      { path: "name", message: "Wajib." },
    ]);
    expect(toErrorResponse(invalid).body).toMatchObject({
      code: "VALIDATION",
      issues: [{ path: "name", message: "Wajib." }],
    });
  });

  it("AppError biasa bukan ValidationError; objek tiruan tanpa penanda tetap 500", () => {
    expect(new AppError("CONFLICT", "x")).not.toBeInstanceOf(ValidationError);
    expect(new ValidationError("x")).toBeInstanceOf(AppError);
    const fake = Object.assign(new Error("bocor"), {
      name: "AppError",
      code: "CONFLICT",
      status: 409,
    });
    expect(toErrorResponse(fake)).toEqual({
      status: 500,
      body: { error: INTERNAL_ERROR_MESSAGE, code: "INTERNAL" },
    });
  });
});
