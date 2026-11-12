import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUndoable, UNDO_WINDOW_MS } from "@/lib/undoable";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createUndoable", () => {
  it("menjalankan aksi setelah jendela Undo habis", () => {
    const commit = vi.fn();
    const undoable = createUndoable(commit);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(undoable.state).toBe("committed");
  });

  it("tidak menjalankan aksi bila dibatalkan sebelum waktunya", () => {
    const commit = vi.fn();
    const undoable = createUndoable(commit);
    expect(undoable.undo()).toBe(true);
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
    expect(undoable.state).toBe("undone");
  });

  it("tidak bisa dibatalkan setelah aksi berjalan", () => {
    const commit = vi.fn();
    const undoable = createUndoable(commit);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(undoable.undo()).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commitNow menjalankan aksi segera dan hanya sekali", () => {
    const commit = vi.fn();
    const undoable = createUndoable(commit);
    undoable.commitNow();
    undoable.commitNow();
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commitNow setelah undo tidak menjalankan aksi", () => {
    const commit = vi.fn();
    const undoable = createUndoable(commit);
    undoable.undo();
    undoable.commitNow();
    expect(commit).not.toHaveBeenCalled();
  });

  it("memakai jendela kustom", () => {
    const commit = vi.fn();
    createUndoable(commit, 100);
    vi.advanceTimersByTime(100);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
