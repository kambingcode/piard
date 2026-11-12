import "server-only";

/** Teks PRD yang sedang ditulis AI, per plan. Hanya di memori: job yang terputus diulang dari awal. */
export type DraftStore = {
  get(planId: string): string;
  set(planId: string, text: string): void;
  clear(planId: string): void;
};

export function createDraftStore(): DraftStore {
  const drafts = new Map<string, string>();
  return {
    get: (planId) => drafts.get(planId) ?? "",
    set: (planId, text) => {
      drafts.set(planId, text);
    },
    clear: (planId) => {
      drafts.delete(planId);
    },
  };
}

// Di globalThis karena job (dipasang instrumentation) dan route handler bisa memuat modul ini
// sebagai dua instans terpisah; keduanya harus melihat draf yang sama.
const globalForDrafts = globalThis as typeof globalThis & {
  __piardPrdDrafts?: DraftStore;
};

export function getDraftStore(): DraftStore {
  globalForDrafts.__piardPrdDrafts ??= createDraftStore();
  return globalForDrafts.__piardPrdDrafts;
}
