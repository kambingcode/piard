import type { DbHandle } from "@/server/db/client";
import { features, planAgentTokens, plans, tasks, workspaces } from "@/server/db/schema";

type Db = DbHandle["db"];

/**
 * Plan langkah kanban dengan dua fitur (posisi 0 dan 1) dan task `todo` per fitur, langsung lewat tabel.
 * Untuk tes jembatan agen (M8) yang tidak butuh job roadmap/spesifikasi.
 */
export function seedBoard(db: Db, userId: string, tasksPerFeature = [2, 1]) {
  const workspace = db
    .insert(workspaces)
    .values({ userId, name: "Pribadi" })
    .returning()
    .get();
  const plan = db
    .insert(plans)
    .values({
      userId,
      workspaceId: workspace.id,
      idea: "Aplikasi booking klinik",
      title: "Klinik",
      step: 6,
    })
    .returning()
    .get();
  const featureRows = tasksPerFeature.map((count, i) => {
    const feature = db
      .insert(features)
      .values({
        planId: plan.id,
        workspaceId: workspace.id,
        name: i === 0 ? "Booking" : "Pembayaran",
        summary: `Ringkasan fitur ${i + 1}`,
        spec: `### Tujuan\nSpesifikasi fitur ${i + 1}`,
        phase: i + 1,
        position: i,
      })
      .returning()
      .get();
    const taskRows = Array.from({ length: count }, (_, position) =>
      db
        .insert(tasks)
        .values({
          planId: plan.id,
          featureId: feature.id,
          title: `Task ${i + 1}.${position + 1}`,
          description: "Deskripsi",
          prompt: `Kerjakan task ${i + 1}.${position + 1}`,
          position,
        })
        .returning()
        .get(),
    );
    return { feature, tasks: taskRows };
  });
  return { workspace, plan, features: featureRows };
}

/** Baris token agen tanpa token mentah (untuk tes repo/service yang tidak lewat HTTP). */
export function seedAgentToken(db: Db, planId: string, label = "Laptop") {
  return db
    .insert(planAgentTokens)
    .values({
      planId,
      label,
      tokenHash: crypto.randomUUID().replaceAll("-", ""),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning()
    .get();
}
