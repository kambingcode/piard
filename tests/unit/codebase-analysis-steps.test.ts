import { describe, expect, it } from "vitest";
import { analysisSteps } from "@/features/codebase/components/analysis-panel";
import type { AnalysisPhase, AnalysisStatus } from "@/features/codebase/schemas";

/** M7-13: langkah progres "Membaca repo → Meringkas berkas → Menyusun dokumentasi" dari fase job. */

function status(
  phase: AnalysisPhase | null,
  done = 0,
  total = 1,
  state: AnalysisStatus["status"] = "analyzing",
): AnalysisStatus {
  return {
    status: state,
    error: state === "failed" ? "gagal" : null,
    job: phase
      ? {
          id: "job",
          state: state === "failed" ? "failed" : "running",
          phase,
          done,
          total,
        }
      : null,
  };
}

const view = (s: AnalysisStatus) =>
  analysisSteps(s).map((step) =>
    [step.label, step.status, step.detail].filter(Boolean).join(" "),
  );

describe("analysisSteps", () => {
  it("antre: semua menunggu, label sesuai urutan", () => {
    expect(view(status(null))).toEqual([
      "Membaca repo pending",
      "Meringkas berkas pending",
      "Menyusun dokumentasi pending",
    ]);
    expect(view(status("queued"))).toEqual(view(status(null)));
  });

  it("fase berjalan menandai langkah sebelumnya selesai dan menampilkan n/total", () => {
    expect(view(status("profile"))).toEqual([
      "Membaca repo running",
      "Meringkas berkas pending",
      "Menyusun dokumentasi pending",
    ]);
    expect(view(status("summarize", 2, 5))).toEqual([
      "Membaca repo done",
      "Meringkas berkas running 2/5",
      "Menyusun dokumentasi pending",
    ]);
    expect(view(status("pages", 6, 10))).toEqual([
      "Membaca repo done",
      "Meringkas berkas done",
      "Menyusun dokumentasi running 6/10",
    ]);
  });

  it("satu potongan saja tidak menampilkan 1/1; selesai = semua done", () => {
    expect(view(status("summarize", 0, 1))[1]).toBe("Meringkas berkas running");
    expect(analysisSteps(status("done", 10, 10)).every((s) => s.status === "done")).toBe(
      true,
    );
  });

  it("gagal menandai langkah yang sedang berjalan", () => {
    expect(view(status("pages", 3, 10, "failed"))).toEqual([
      "Membaca repo done",
      "Meringkas berkas done",
      "Menyusun dokumentasi failed 3/10",
    ]);
  });
});
