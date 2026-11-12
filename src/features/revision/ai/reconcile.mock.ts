import type { ChangeTarget, RawChange } from "./changes.schema";

/** Nama fitur bercetak tebal di daftar bernomor bagian 3 PRD (format PRD mock dan prompt PRD). */
function prdFeatureNames(prd: string): string[] {
  const start = prd.search(/^## 3\. /m);
  if (start === -1) return [];
  const rest = prd.slice(start);
  const end = rest.slice(1).search(/^## \d+\. /m);
  const section = end === -1 ? rest : rest.slice(0, end + 1);
  return [...section.matchAll(/^\d+\.\s+\*\*(.+?)\*\*/gm)].map((m) =>
    (m[1] ?? "").trim(),
  );
}

/**
 * Penyesuaian palsu (`LLM_MODE=mock`): fitur bernama di PRD tetapi tidak di roadmap ditambahkan,
 * fitur roadmap yang tidak disebut PRD dihapus. Deterministik sehingga bisa dites.
 */
export function mockReconcile(prd: string, features: ChangeTarget[]): RawChange[] {
  const named = prdFeatureNames(prd);
  if (named.length === 0) return [];
  const key = (name: string) => name.trim().toLowerCase();
  const inPrd = new Set(named.map(key));
  const inRoadmap = new Set(features.map((f) => key(f.name)));
  return [
    ...named
      .filter((name) => !inRoadmap.has(key(name)))
      .map((name): RawChange => ({ op: "add", name, summary: "", subFeatures: [] })),
    ...features
      .filter((f) => !inPrd.has(key(f.name)))
      .map((f): RawChange => ({ op: "remove", featureId: f.id })),
  ];
}
