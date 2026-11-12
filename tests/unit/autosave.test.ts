import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver, type SaveStatus } from "@/lib/autosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(save: (value: string) => Promise<void> = async () => undefined) {
  const statuses: SaveStatus[] = [];
  const saver = createAutosaver<string>({
    save,
    onStatus: (s) => statuses.push(s),
    delayMs: 100,
  });
  return { saver, statuses };
}

describe("createAutosaver", () => {
  it("menggabungkan perubahan beruntun menjadi satu simpanan dengan nilai terbaru", async () => {
    const save = vi.fn(async () => undefined);
    const { saver, statuses } = setup(save);
    saver.schedule("a");
    saver.schedule("ab");
    saver.schedule("abc");
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("abc");
    expect(statuses.at(-1)).toBe("saved");
  });

  it("flush menyimpan segera dan menunggu sampai selesai", async () => {
    const save = vi.fn(async () => undefined);
    const { saver } = setup(save);
    saver.schedule("x");
    await saver.flush();
    expect(save).toHaveBeenCalledWith("x");
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush tanpa perubahan tidak menyimpan apa pun", async () => {
    const save = vi.fn(async () => undefined);
    const { saver } = setup(save);
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("tidak pernah menyimpan tumpang tindih dan menyimpan nilai terbaru sesudahnya", async () => {
    let running = 0;
    let maxRunning = 0;
    const saved: string[] = [];
    const { saver, statuses } = setup(async (value) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 300));
      saved.push(value);
      running -= 1;
    });

    saver.schedule("satu");
    await vi.advanceTimersByTimeAsync(100); // simpanan "satu" berjalan
    saver.schedule("dua");
    await vi.advanceTimersByTimeAsync(100); // "dua" menunggu giliran
    await vi.advanceTimersByTimeAsync(1000);

    expect(maxRunning).toBe(1);
    expect(saved).toEqual(["satu", "dua"]);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("melaporkan error dan mencoba lagi nilai yang sama pada flush berikutnya", async () => {
    let fail = true;
    const save = vi.fn(async () => {
      if (fail) throw new Error("jaringan");
    });
    const { saver, statuses } = setup(save);
    saver.schedule("data");
    await vi.advanceTimersByTimeAsync(100);
    expect(statuses.at(-1)).toBe("error");
    expect(await saver.flush()).toBe(false); // masih gagal selama jaringan bermasalah

    fail = false;
    expect(await saver.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith("data");
    expect(statuses.at(-1)).toBe("saved");
  });

  it("cancel membuang jadwal yang belum berjalan", async () => {
    const save = vi.fn(async () => undefined);
    const { saver } = setup(save);
    saver.schedule("x");
    saver.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });
});
