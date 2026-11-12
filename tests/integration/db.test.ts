import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import {
  documents,
  features,
  jobs,
  planMessages,
  plans,
  sessions,
  tasks,
  usage,
  users,
  workspaces,
} from "@/server/db/schema";
import { createTestDb } from "../helpers/test-db";

let handle: DbHandle;

beforeEach(() => {
  handle = createTestDb();
});
afterEach(() => handle.close());

function seedPlan() {
  const { db } = handle;
  const user = db
    .insert(users)
    .values({ email: "a@b.c", passwordHash: "x", name: "A" })
    .returning()
    .get();
  const workspace = db
    .insert(workspaces)
    .values({ userId: user.id, name: "WS" })
    .returning()
    .get();
  const plan = db
    .insert(plans)
    .values({ userId: user.id, workspaceId: workspace.id, idea: "ide" })
    .returning()
    .get();
  return { user, workspace, plan };
}

describe("skema database", () => {
  it("memberi default yang masuk akal pada plan baru", () => {
    const { plan } = seedPlan();
    expect(plan).toMatchObject({
      language: "id",
      step: 1,
      status: "draft",
      techStack: {},
      extras: [],
      questionAnswers: { questions: [], answers: {} },
      syncState: {},
      title: null,
    });
    expect(plan.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.createdAt).toBeInstanceOf(Date);
  });

  it("memperbarui updatedAt otomatis", async () => {
    const { db } = handle;
    const { plan } = seedPlan();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = db
      .update(plans)
      .set({ title: "Judul" })
      .where(eq(plans.id, plan.id))
      .returning()
      .get();
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(plan.updatedAt.getTime());
  });

  it("menjaga nilai JSON bertipe saat disimpan dan dibaca", () => {
    const { db } = handle;
    const { plan } = seedPlan();
    const questionAnswers = {
      questions: [
        {
          id: "q1",
          question: "Siapa?",
          type: "single_choice" as const,
          options: ["a", "b", "c"],
          required: true,
        },
      ],
      answers: { q1: "a" },
    };
    db.update(plans).set({ questionAnswers }).where(eq(plans.id, plan.id)).run();
    const stored = db.select().from(plans).where(eq(plans.id, plan.id)).get();
    expect(stored?.questionAnswers).toEqual(questionAnswers);
  });

  it("menghapus turunan plan secara berantai", () => {
    const { db } = handle;
    const { user, workspace, plan } = seedPlan();
    const parent = db
      .insert(features)
      .values({ planId: plan.id, workspaceId: workspace.id, name: "F" })
      .returning()
      .get();
    db.insert(features)
      .values({
        planId: plan.id,
        workspaceId: workspace.id,
        parentId: parent.id,
        name: "S",
      })
      .run();
    db.insert(tasks).values({ planId: plan.id, featureId: parent.id, title: "T" }).run();
    db.insert(documents).values({ planId: plan.id, content: "# PRD" }).run();
    db.insert(planMessages).values({ planId: plan.id, role: "user", parts: [] }).run();
    db.insert(jobs).values({ kind: "roadmap", planId: plan.id }).run();
    db.insert(usage)
      .values({ userId: user.id, planId: plan.id, kind: "roadmap", model: "m" })
      .run();

    db.delete(plans).where(eq(plans.id, plan.id)).run();

    expect(db.select().from(features).all()).toHaveLength(0);
    expect(db.select().from(tasks).all()).toHaveLength(0);
    expect(db.select().from(documents).all()).toHaveLength(0);
    expect(db.select().from(planMessages).all()).toHaveLength(0);
    expect(db.select().from(jobs).all()).toHaveLength(0);
    // Riwayat biaya tetap ada, hanya kehilangan rujukan plan.
    expect(db.select().from(usage).all()).toMatchObject([
      { planId: null, kind: "roadmap" },
    ]);
  });

  it("menghapus sub-fitur bersama induknya", () => {
    const { db } = handle;
    const { workspace, plan } = seedPlan();
    const parent = db
      .insert(features)
      .values({ planId: plan.id, workspaceId: workspace.id, name: "F" })
      .returning()
      .get();
    db.insert(features)
      .values({
        planId: plan.id,
        workspaceId: workspace.id,
        parentId: parent.id,
        name: "S",
      })
      .run();
    db.delete(features).where(eq(features.id, parent.id)).run();
    expect(db.select().from(features).all()).toHaveLength(0);
  });

  it("menolak email ganda dan versi dokumen ganda", () => {
    const { db } = handle;
    const { plan } = seedPlan();
    expect(() =>
      db.insert(users).values({ email: "a@b.c", passwordHash: "y", name: "B" }).run(),
    ).toThrow(/UNIQUE/);
    db.insert(documents).values({ planId: plan.id, content: "v1" }).run();
    expect(() =>
      db.insert(documents).values({ planId: plan.id, content: "v1 lagi" }).run(),
    ).toThrow(/UNIQUE/);
    db.insert(documents).values({ planId: plan.id, content: "v2", version: 2 }).run();
  });

  it("menegakkan kunci asing", () => {
    const { db } = handle;
    expect(() =>
      db
        .insert(plans)
        .values({ userId: "tidak-ada", workspaceId: "tidak-ada", idea: "x" })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("menghapus sesi bersama penggunanya", () => {
    const { db } = handle;
    const { user } = seedPlan();
    db.insert(sessions)
      .values({ id: "hash", userId: user.id, expiresAt: new Date(Date.now() + 1000) })
      .run();
    db.delete(users).where(eq(users.id, user.id)).run();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });
});

describe("migrasi", () => {
  it("aman dijalankan berulang pada database yang sama", async () => {
    const { runMigrations } = await import("@/server/db/client");
    expect(() => runMigrations(handle.db)).not.toThrow();
  });
});
