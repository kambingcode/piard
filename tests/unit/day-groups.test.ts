import { describe, expect, it } from "vitest";
import { dayGroupOf, groupByDay } from "@/lib/day-groups";

const now = new Date(2026, 9, 29, 15, 30); // 29 Okt 2026, sore
const daysAgo = (days: number, hour = 9) => new Date(2026, 9, 29 - days, hour);

describe("dayGroupOf", () => {
  it.each([
    [daysAgo(0, 0), "today"],
    [daysAgo(0, 23), "today"],
    [daysAgo(1, 23), "yesterday"],
    [daysAgo(2), "week"],
    [daysAgo(6), "week"],
    [daysAgo(7), "month"],
    [daysAgo(29), "month"],
    [daysAgo(30), "older"],
    [daysAgo(200), "older"],
  ])("%s → %s", (date, group) => {
    expect(dayGroupOf(date, now)).toBe(group);
  });

  it("memakai hari kalender, bukan selisih 24 jam", () => {
    // 23:59 kemarin hanya 15,5 jam sebelum `now`, tetapi tetap "kemarin".
    expect(dayGroupOf(new Date(2026, 9, 28, 23, 59), now)).toBe("yesterday");
  });

  it("tanggal di masa depan dianggap hari ini", () => {
    expect(dayGroupOf(new Date(2026, 9, 30), now)).toBe("today");
  });
});

describe("groupByDay", () => {
  it("mengelompokkan dengan urutan tetap, tanpa kelompok kosong, dan mempertahankan urutan item", () => {
    const items = [
      { id: "lama", at: daysAgo(90) },
      { id: "a", at: daysAgo(0) },
      { id: "b", at: daysAgo(0, 8) },
      { id: "kemarin", at: daysAgo(1) },
    ];
    const groups = groupByDay(items, (item) => item.at, now);
    expect(groups.map((g) => g.group)).toEqual(["today", "yesterday", "older"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("daftar kosong menghasilkan tanpa kelompok", () => {
    expect(groupByDay([], () => now, now)).toEqual([]);
  });
});
