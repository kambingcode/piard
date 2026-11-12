export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export const AUTOSAVE_DELAY_MS = 800;

export type Autosaver<T> = {
  /** Menjadwalkan penyimpanan nilai terbaru; panggilan beruntun digabung (debounce). */
  schedule(value: T): void;
  /**
   * Menyimpan sekarang (mis. sebelum pindah langkah) dan menunggu semua simpanan selesai.
   * @returns true bila tidak ada perubahan yang tertinggal (semuanya tersimpan).
   */
  flush(): Promise<boolean>;
  /** Membuang jadwal yang belum berjalan. */
  cancel(): void;
};

type Options<T> = {
  save: (value: T) => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  delayMs?: number;
};

/**
 * Autosave dengan debounce dan antrean: simpanan tidak pernah tumpang tindih, dan yang tersimpan
 * selalu nilai terbaru. Bila simpanan gagal, nilainya dipertahankan untuk dicoba lagi pada
 * `flush`/`schedule` berikutnya (tanpa pengulangan otomatis yang membanjiri server).
 */
export function createAutosaver<T>({
  save,
  onStatus,
  delayMs = AUTOSAVE_DELAY_MS,
}: Options<T>): Autosaver<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | undefined;
  let queue: Promise<void> = Promise.resolve();

  async function flush(): Promise<boolean> {
    clearTimeout(timer);
    timer = undefined;
    if (!pending) {
      await queue;
      return !pending;
    }

    const { value } = pending;
    pending = undefined;
    onStatus("saving");
    queue = queue.then(async () => {
      try {
        await save(value);
        // Nilai yang lebih baru sudah menunggu: status "saved" belum berlaku.
        onStatus(pending ? "dirty" : "saved");
      } catch {
        pending ??= { value };
        onStatus("error");
      }
    });
    await queue;
    return !pending;
  }

  return {
    schedule(value) {
      pending = { value };
      onStatus("dirty");
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
  };
}
