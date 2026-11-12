import { describe, expect, it } from "vitest";
import {
  paletteCommands,
  searchCommands,
} from "@/features/plans/components/palette-commands";

const plans = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, title: `Plan ${i}` }));

describe("perintah palette", () => {
  it("tanpa plan terbuka: hanya navigasi dan plan", () => {
    const ids = paletteCommands({ current: null, plans }).map((c) => c.id);
    expect(ids.slice(0, 3)).toEqual(["new-plan", "all-plans", "settings"]);
    expect(ids).not.toContain("export-zip");
  });

  it("plan terbuka setelah roadmap: bagian plan dan ekspor, plan itu tidak diulang di daftar", () => {
    const commands = paletteCommands({
      current: { id: "p1", title: "Plan 1", step: 4 },
      plans,
    });
    expect(commands.filter((c) => c.group === "current").map((c) => c.id)).toEqual([
      "view-roadmap",
      "view-prd",
      "view-tasks",
      "view-kanban",
      "view-usage",
      "export-md",
      "export-zip",
    ]);
    expect(commands.find((c) => c.id === "export-zip")?.action).toEqual({
      kind: "download",
      url: "/api/plan/export?planId=p1&format=zip",
    });
    expect(commands.some((c) => c.id === "plan-p1")).toBe(false);
  });

  it("plan yang belum sampai roadmap tidak mendapat bagian plan", () => {
    const commands = paletteCommands({
      current: { id: "p1", title: "Plan 1", step: 2 },
      plans,
    });
    expect(commands.some((c) => c.group === "current")).toBe(false);
  });

  it("tanpa kueri, plan lain dipangkas ke lima terakhir", () => {
    const shown = searchCommands(paletteCommands({ current: null, plans }), "");
    expect(shown.filter((c) => c.group === "plans")).toHaveLength(5);
  });

  it("setiap kata harus cocok, tanpa peduli huruf besar dan aksen, termasuk kata kunci", () => {
    const commands = paletteCommands({
      current: { id: "p1", title: "Klinik", step: 4 },
      plans,
    });
    expect(searchCommands(commands, "UNDUH zip").map((c) => c.id)).toEqual([
      "export-zip",
    ]);
    expect(searchCommands(commands, "biaya").map((c) => c.id)).toEqual([
      "view-usage",
      "settings",
    ]);
    expect(searchCommands(commands, "plan 7").map((c) => c.id)).toEqual(["plan-p7"]);
    expect(searchCommands(commands, "tidak ada")).toEqual([]);
  });
});
