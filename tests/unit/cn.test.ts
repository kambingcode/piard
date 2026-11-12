import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("menggabungkan kelas kondisional", () => {
    expect(cn("a", false && "b", undefined, ["c"], { d: true, e: false })).toBe("a c d");
  });

  it("kelas Tailwind yang terakhir menang atas yang bentrok", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });
});
