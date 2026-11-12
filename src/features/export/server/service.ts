import "server-only";

import { planTitle } from "@/features/plans";
import type { PlansService } from "@/features/plans/server";
import type { PrdService } from "@/features/prd/server";
import type { RoadmapService } from "@/features/roadmap/server";
import type { TasksService } from "@/features/tasks/server";
import { slugify } from "@/lib/slug";
import { exportFiles, zipFiles } from "../bundle";

type Deps = {
  plans: PlansService;
  prd: Pick<PrdService, "exportMarkdown">;
  roadmap: Pick<RoadmapService, "getRoadmap">;
  tasks: Pick<TasksService, "listTasks">;
  /**
   * Dokumentasi proyek eksisting asal plan (M7-20): `{ "NN-slug.md": isi }`, masuk folder `codebase/`
   * di ZIP agar agen coding punya konteks. Bawaan: tidak ada.
   */
  codebaseFiles?: (userId: string, codebaseId: string) => Record<string, string>;
};

/** Folder dokumentasi proyek eksisting di ZIP plan berkonteks. */
export const CODEBASE_FOLDER = "codebase";

export type ExportedFile = {
  filename: string;
  contentType: string;
  body: string | Uint8Array<ArrayBuffer>;
};

/** Ekspor plan: PRD sebagai Markdown, atau paket ZIP PRD + berkas per fitur (R11). */
export function createExportService({ plans, prd, roadmap, tasks, codebaseFiles }: Deps) {
  return {
    markdown(userId: string, planId: string, version?: number): ExportedFile {
      const { filename, content } = prd.exportMarkdown(userId, planId, version);
      return { filename, contentType: "text/markdown; charset=utf-8", body: content };
    },

    /** @throws NOT_FOUND bila PRD belum ada (paket tanpa PRD tidak berguna). */
    zip(userId: string, planId: string): ExportedFile {
      const { plan } = plans.getPlan(userId, planId);
      const { content } = prd.exportMarkdown(userId, plan.id);
      const state = roadmap.getRoadmap(userId, plan.id);
      const allTasks = tasks.listTasks(userId, plan.id);
      const files = exportFiles(
        content,
        state.features.map((f) => ({
          name: f.name,
          summary: f.summary,
          spec: f.spec,
          subFeatures: state.subFeatures
            .filter((s) => s.parentId === f.id)
            .map((s) => ({ name: s.name, summary: s.summary, spec: s.spec })),
          tasks: allTasks.filter((t) => t.featureId === f.id),
        })),
      );
      // Plan tanpa proyek eksisting: struktur ZIP tidak berubah sama sekali.
      const docs = plan.codebaseId
        ? (codebaseFiles?.(userId, plan.codebaseId) ?? {})
        : {};
      for (const [name, text] of Object.entries(docs)) {
        files[`${CODEBASE_FOLDER}/${name}`] = text;
      }
      return {
        filename: `${slugify(planTitle(plan))}.zip`,
        contentType: "application/zip",
        body: zipFiles(files, new Date()),
      };
    },
  };
}

export type ExportService = ReturnType<typeof createExportService>;
