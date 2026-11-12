import { describe, expect, it } from "vitest";
import type { RoadmapState } from "@/features/roadmap";
import { roadmapSteps } from "@/features/roadmap";

const state = (patch: Partial<RoadmapState>): RoadmapState => ({
  status: "generating",
  title: null,
  features: [],
  subFeatures: [],
  job: { id: "j", phase: "reading", done: 0, error: null },
  ...patch,
});

const statuses = (s: RoadmapState) => roadmapSteps(s).map((step) => step.status);

describe("roadmapSteps", () => {
  it("antre: langkah pertama berjalan dengan keterangan menunggu giliran", () => {
    const steps = roadmapSteps(
      state({ job: { id: "j", phase: "queued", done: 0, error: null } }),
    );
    expect(steps.map((s) => s.status)).toEqual(["running", "pending", "pending"]);
    expect(steps[0]?.detail).toBe("Menunggu giliran");
  });

  it("menyusun fitur: langkah sebelumnya selesai dan jumlah fitur terlihat", () => {
    const features = [{ id: "a" }, { id: "b" }] as RoadmapState["features"];
    const steps = roadmapSteps(
      state({ features, job: { id: "j", phase: "features", done: 2, error: null } }),
    );
    expect(steps.map((s) => s.status)).toEqual(["done", "running", "pending"]);
    expect(steps[1]?.detail).toBe("2 fitur");
  });

  it("gagal: langkah tempat job berhenti ditandai gagal", () => {
    expect(
      statuses(
        state({
          status: "failed",
          job: { id: "j", phase: "features", done: 1, error: "x" },
        }),
      ),
    ).toEqual(["done", "failed", "pending"]);
  });

  it("selesai: semua langkah selesai", () => {
    expect(
      statuses(
        state({ status: "ready", job: { id: "j", phase: "done", done: 7, error: null } }),
      ),
    ).toEqual(["done", "done", "done"]);
  });
});
