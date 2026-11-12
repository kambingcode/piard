import { describe, expect, it, vi } from "vitest";
import { createHiddenSet } from "@/lib/hidden-set";

describe("createHiddenSet", () => {
  it("menyembunyikan dan menampilkan kembali id, memberi tahu pendengar", () => {
    const store = createHiddenSet();
    const listener = vi.fn();
    store.subscribe(listener);

    store.hide("a");
    expect(store.getSnapshot().has("a")).toBe(true);
    store.unhide("a");
    expect(store.getSnapshot().has("a")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("snapshot stabil bila tidak ada perubahan (tidak memicu render ulang)", () => {
    const store = createHiddenSet();
    store.hide("a");
    const before = store.getSnapshot();
    store.hide("a");
    store.unhide("tidak-ada");
    expect(store.getSnapshot()).toBe(before);
  });

  it("snapshot lama tidak ikut berubah (tidak dimutasi)", () => {
    const store = createHiddenSet();
    const empty = store.getSnapshot();
    store.hide("a");
    expect(empty.has("a")).toBe(false);
  });

  it("berhenti memberi tahu setelah berhenti berlangganan, dan server selalu kosong", () => {
    const store = createHiddenSet();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.hide("a");
    expect(listener).not.toHaveBeenCalled();
    expect(store.getServerSnapshot().size).toBe(0);
  });

  it("dua pelanggan melihat perubahan yang sama", () => {
    const store = createHiddenSet();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.hide("x");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
