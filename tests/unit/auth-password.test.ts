import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/features/auth/server/password";

describe("hashPassword / verifyPassword", () => {
  it("memverifikasi kata sandi yang benar dan menolak yang salah", async () => {
    const hash = await hashPassword("rahasia-panjang");
    expect(await verifyPassword("rahasia-panjang", hash)).toBe(true);
    expect(await verifyPassword("rahasia-panjang!", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("memakai garam acak sehingga hash berbeda tiap kali", async () => {
    const [a, b] = await Promise.all([hashPassword("sama"), hashPassword("sama")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("sama", a)).toBe(true);
    expect(await verifyPassword("sama", b)).toBe(true);
  });

  it("tidak memuat kata sandi asli di hash dan memakai format berparameter", async () => {
    const hash = await hashPassword("kata-sandi-unik-123");
    expect(hash).not.toContain("kata-sandi-unik-123");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it("menganggap bentuk Unicode yang setara sebagai kata sandi yang sama", async () => {
    const hash = await hashPassword("café"); // é satu titik kode
    expect(await verifyPassword("café", hash)).toBe(true); // e + aksen gabungan
  });

  it.each([
    "",
    "bukan-hash",
    "bcrypt$10$a$b$c$d",
    "scrypt$16384$8$1$$",
    "scrypt$abc$8$1$AAAA$AAAA",
    "scrypt$1073741824$8$1$AAAA$AAAA", // parameter biaya tak masuk akal
  ])("menganggap hash rusak %j sebagai salah, bukan galat", async (broken) => {
    expect(await verifyPassword("apa saja", broken)).toBe(false);
  });
});
