import { describe, expect, it } from "vitest";
import { collapseUnchanged, diffLines } from "@/lib/line-diff";

describe("diff per baris", () => {
  it("dokumen sama: semua baris sama", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("baris diganti: yang lama dihapus sebelum yang baru, sisanya tetap", () => {
    expect(diffLines("# PRD\nlama\nakhir", "# PRD\nbaru\nakhir")).toEqual([
      { kind: "same", text: "# PRD" },
      { kind: "removed", text: "lama" },
      { kind: "added", text: "baru" },
      { kind: "same", text: "akhir" },
    ]);
  });

  it("menambah dan menghapus di ujung", () => {
    expect(diffLines("a\nb", "b\nc").map((l) => `${l.kind}:${l.text}`)).toEqual([
      "removed:a",
      "same:b",
      "added:c",
    ]);
  });

  it("melipat baris sama yang jauh dari perubahan", () => {
    const before = Array.from({ length: 20 }, (_, i) => `baris ${i}`).join("\n");
    const after = before.replace("baris 10", "baris sepuluh");
    const blocks = collapseUnchanged(diffLines(before, after), 2);
    expect(
      blocks.map((b) => (b.kind === "collapsed" ? `…${b.count}` : b.lines.length)),
    ).toEqual(["…8", 6, "…7"]);
  });
});
