import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthRepo } from "@/features/auth/server/repo";
import { type AuthService, createAuthService } from "@/features/auth/server/service";
import type { DbHandle } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { createTestDb } from "../helpers/test-db";

const fakeHash = (password: string) =>
  `fake:${createHash("sha256").update(password).digest("hex")}`;

const OWNER = {
  name: "Pemilik",
  email: "pemilik@piard.local",
  password: "kata-sandi-aman",
};
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

let handle: DbHandle;
let clock: Date;
let service: AuthService;

beforeEach(() => {
  handle = createTestDb();
  clock = new Date("2026-10-29T10:00:00Z");
  service = createAuthService({
    repo: createAuthRepo(handle.db),
    sessionTtlDays: 30,
    now: () => clock,
    // Hash palsu agar tes cepat; hashing nyata sudah diuji di auth-password.test.ts.
    hash: async (password) => fakeHash(password),
    verify: async (password, hash) => hash === fakeHash(password),
  });
});
afterEach(() => handle.close());

const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

async function catchError(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("Diharapkan AppError");
}

describe("signUp", () => {
  it("membuat akun pemilik dan langsung memberi sesi", async () => {
    expect(service.isSignUpOpen()).toBe(true);
    const session = await service.signUp(OWNER);
    expect(session.user).toEqual({
      id: expect.any(String),
      email: OWNER.email,
      name: OWNER.name,
    });
    expect(session.expiresAt.getTime()).toBe(clock.getTime() + 30 * DAY);
    expect(service.userFromToken(session.token)).toEqual(session.user);
    expect(service.isSignUpOpen()).toBe(false);
  });

  it("menutup pendaftaran setelah akun pertama", async () => {
    await service.signUp(OWNER);
    const error = await catchError(() =>
      service.signUp({ ...OWNER, email: "lain@piard.local" }),
    );
    expect(error).toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("tidak menyimpan kata sandi mentah", async () => {
    await service.signUp(OWNER);
    const stored = createAuthRepo(handle.db).findUserByEmail(OWNER.email);
    expect(stored?.passwordHash).not.toBe(OWNER.password);
    expect(JSON.stringify(stored)).not.toContain(OWNER.password);
  });

  it("repo menolak pengguna kedua walau service dilewati (anti-balapan)", () => {
    const repo = createAuthRepo(handle.db);
    const input = { email: "a@b.c", name: "A", passwordHash: "x" };
    expect(repo.createFirstUser(input)).toBeDefined();
    expect(repo.createFirstUser({ ...input, email: "b@b.c" })).toBeUndefined();
    expect(repo.countUsers()).toBe(1);
  });
});

describe("sesi", () => {
  it("hanya menyimpan hash token, bukan token mentah", async () => {
    const { token } = await service.signUp(OWNER);
    const [row] = handle.db.select().from(sessions).all();
    expect(row?.id).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row?.id).not.toBe(token);
  });

  it("kedaluwarsa tepat pada batas waktunya", async () => {
    const { token } = await service.signUp(OWNER);
    advance(30 * DAY - 1);
    expect(service.userFromToken(token)).toBeDefined();
    advance(1);
    expect(service.userFromToken(token)).toBeUndefined();
  });

  it("menolak token acak dan token kosong", async () => {
    await service.signUp(OWNER);
    expect(service.userFromToken("acak")).toBeUndefined();
    expect(service.userFromToken("")).toBeUndefined();
  });

  it("signOut membatalkan sesi itu saja", async () => {
    await service.signUp(OWNER);
    const other = await service.signIn({ email: OWNER.email, password: OWNER.password });
    const third = await service.signIn({ email: OWNER.email, password: OWNER.password });
    service.signOut(other.token);
    expect(service.userFromToken(other.token)).toBeUndefined();
    expect(service.userFromToken(third.token)).toBeDefined();
  });

  it("membersihkan sesi kedaluwarsa saat sesi baru dibuat", async () => {
    await service.signUp(OWNER);
    advance(31 * DAY);
    await service.signIn({ email: OWNER.email, password: OWNER.password });
    expect(handle.db.select().from(sessions).all()).toHaveLength(1);
  });
});

describe("signIn", () => {
  beforeEach(async () => {
    await service.signUp(OWNER);
  });

  it("masuk dengan kredensial benar", async () => {
    const session = await service.signIn({
      email: OWNER.email,
      password: OWNER.password,
    });
    expect(session.user.email).toBe(OWNER.email);
    expect(service.userFromToken(session.token)).toBeDefined();
  });

  it("memberi pesan yang sama untuk email tak dikenal dan kata sandi salah", async () => {
    const wrongPassword = await catchError(() =>
      service.signIn({ email: OWNER.email, password: "salah" }),
    );
    const unknownEmail = await catchError(() =>
      service.signIn({ email: "tidak@ada.id", password: OWNER.password }),
    );
    expect(wrongPassword).toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(unknownEmail.message).toBe(wrongPassword.message);
    expect(unknownEmail.status).toBe(wrongPassword.status);
  });

  it("mengunci sementara setelah 5 percobaan gagal, bahkan untuk kata sandi benar", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await catchError(() => service.signIn({ email: OWNER.email, password: "salah" }));
    }
    const locked = await catchError(() =>
      service.signIn({ email: OWNER.email, password: OWNER.password }),
    );
    expect(locked).toMatchObject({ code: "UNAUTHORIZED", status: 429 });
    expect(locked.message).toMatch(/15 menit/);

    advance(15 * MINUTE + 1);
    const session = await service.signIn({
      email: OWNER.email,
      password: OWNER.password,
    });
    expect(session.user.email).toBe(OWNER.email);
  });

  it("menghitung ulang dari nol setelah masa kunci lewat", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await catchError(() => service.signIn({ email: OWNER.email, password: "salah" }));
    }
    advance(15 * MINUTE + 1);
    await catchError(() => service.signIn({ email: OWNER.email, password: "salah" }));
    // Satu kegagalan baru tidak boleh langsung mengunci lagi.
    const session = await service.signIn({
      email: OWNER.email,
      password: OWNER.password,
    });
    expect(session.token).toBeTruthy();
  });

  it("keberhasilan menghapus hitungan gagal", async () => {
    for (let round = 0; round < 3; round++) {
      for (let attempt = 0; attempt < 4; attempt++) {
        await catchError(() => service.signIn({ email: OWNER.email, password: "salah" }));
      }
      await service.signIn({ email: OWNER.email, password: OWNER.password });
    }
  });
});
