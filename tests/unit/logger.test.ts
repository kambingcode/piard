import { describe, expect, it } from "vitest";
import { createLogger, type LogRecord, prettySink } from "@/server/logger";

const FIXED = new Date("2026-10-29T10:00:00.000Z");

function setup(level: "debug" | "info" | "warn" | "error" = "info") {
  const records: LogRecord[] = [];
  const logger = createLogger({ level, sink: (r) => records.push(r), now: () => FIXED });
  return { records, logger };
}

describe("createLogger", () => {
  it("membuang pesan di bawah level", () => {
    const { logger, records } = setup("warn");
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(records.map((r) => r.message)).toEqual(["c", "d"]);
  });

  it("menyusun cakupan bertingkat lewat child", () => {
    const { logger, records } = setup();
    logger.child("jobs").child("roadmap").info("mulai");
    expect(records[0]?.scope).toBe("jobs:roadmap");
    expect(records[0]?.time).toBe(FIXED.toISOString());
  });

  it("menyembunyikan nilai rahasia, termasuk yang bersarang", () => {
    const { logger, records } = setup();
    logger.info("masuk", {
      userId: 1,
      apiKey: "sk-x",
      nested: { Password: "p", list: [{ token: "t", ok: true }] },
    });
    expect(JSON.stringify(records[0]?.context)).not.toMatch(/sk-x|"p"|"t"/);
    expect(records[0]?.context).toMatchObject({
      userId: 1,
      apiKey: "[disembunyikan]",
      nested: {
        Password: "[disembunyikan]",
        list: [{ token: "[disembunyikan]", ok: true }],
      },
    });
  });

  it("mengurai Error beserta penyebabnya", () => {
    const { logger, records } = setup();
    logger.error("gagal", { err: new Error("luar", { cause: new Error("dalam") }) });
    expect(records[0]?.context).toMatchObject({
      err: { name: "Error", message: "luar", cause: { message: "dalam" } },
    });
  });

  it("tidak jatuh pada referensi melingkar", () => {
    const { logger, records } = setup();
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    logger.info("loop", { loop });
    expect(records).toHaveLength(1);
  });
});

describe("prettySink", () => {
  it("menulis satu baris ringkas", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "info",
      sink: prettySink((l) => lines.push(l)),
      scope: "db",
      now: () => FIXED,
    });
    logger.warn("lambat", { ms: 12 });
    expect(lines).toEqual(['2026-10-29T10:00:00.000Z WARN  [db] lambat {"ms":12}']);
  });
});

describe("level silent", () => {
  it("membisukan semua level", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ level: "silent", sink: (r) => records.push(r) });
    logger.error("tetap diam");
    expect(records).toEqual([]);
  });
});
