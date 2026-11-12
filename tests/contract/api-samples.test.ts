import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { features, plans } from "@/server/db/schema";
import { HAS_SAMPLES, isRecord, loadSample } from "../helpers/api-samples";

/**
 * Kontrak data: setiap field pada contoh respons situs acuan harus punya padanan di skema DB
 * Piard, atau tercatat di sini sebagai sengaja ditunda. Bila contoh baru menambah field,
 * tes ini gagal dan memaksa keputusan eksplisit. Kontrak respons API itu sendiri (bentuk JSON
 * endpoint Piard) ditambahkan per fitur mulai M1-01.
 */

/** Field plan di situs acuan yang belum didukung Piard dan alasannya. */
const PLAN_FIELDS_DEFERRED: Record<string, string> = {
  experience:
    "preferensi pengalaman; PATCH menerimanya tetapi mengabaikannya (M1-01), tidak disimpan",
  budget:
    "preferensi anggaran; PATCH menerimanya tetapi mengabaikannya (M1-01), tidak disimpan",
  chatSummary: "ringkasan chat revisi (M5)",
  chatSummaryUpToPosition: "ringkasan chat revisi (M5)",
  prdSummaryVersion: "versi ringkasan PRD (M5)",
  prdAccessSource: "gerbang berbayar situs asli; Piard tanpa paket",
  promptCopied: "penanda UI situs asli",
  cycle: "siklus plan berbayar situs asli",
  agentContextMode: "mode konteks agen situs asli",
  forkedFromId: "fork/templat; di luar cakupan",
  continuesPlanId: "fork/templat; di luar cakupan",
  forkedFromTemplateVersionId: "templat marketplace; di luar cakupan",
  workspaceName: "hasil join workspace, bukan kolom plan",
  starterTemplate: "templat marketplace; di luar cakupan",
  isCodebaseBaseline:
    "plan dasar codebase situs asli; Piard memakai `codebaseId` untuk plan fitur baru (M7-18)",
  prdAddonReserved: "add-on berbayar situs asli",
};

/**
 * Field yang ada di respons tetapi bukan kolom: nilainya turunan dari kolom lain dan harus
 * ditambahkan lapisan API (`toSubFeature` di fitur roadmap; dites di tests/integration/roadmap-api.test.ts).
 */
const SUBFEATURE_ALIASES: Record<string, Record<string, string>> = {
  subFeatures: { featureId: "parentId" },
};

function sampleKeys(sample: unknown, path: string[]): string[] {
  let node: unknown = sample;
  for (const key of path) node = isRecord(node) ? node[key] : undefined;
  const target = Array.isArray(node) ? node[0] : node;
  if (!isRecord(target)) throw new Error(`Contoh tidak punya objek di ${path.join(".")}`);
  return Object.keys(target);
}

describe.skipIf(!HAS_SAMPLES)("contoh respons situs acuan", () => {
  it("setiap field plan didukung skema Piard atau ditunda dengan alasan", () => {
    const keys = sampleKeys(loadSample("plan-get-after-roadmap.json"), ["plan"]);
    const supported = new Set(Object.keys(getTableColumns(plans)));
    const unaccounted = keys.filter(
      (key) => !supported.has(key) && !(key in PLAN_FIELDS_DEFERRED),
    );
    expect(unaccounted).toEqual([]);
  });

  it("daftar field yang ditunda tidak berisi field yang sebenarnya sudah didukung", () => {
    const supported = new Set(Object.keys(getTableColumns(plans)));
    expect(Object.keys(PLAN_FIELDS_DEFERRED).filter((key) => supported.has(key))).toEqual(
      [],
    );
  });

  it("setiap field fitur dan sub-fitur punya kolom di tabel features (atau alias turunan)", () => {
    const sample = loadSample("roadmap-generate-ready.json");
    const supported = new Set(Object.keys(getTableColumns(features)));
    for (const list of ["features", "subFeatures"]) {
      const aliases = SUBFEATURE_ALIASES[list] ?? {};
      const missing = sampleKeys(sample, [list]).filter(
        (key) => !supported.has(key) && !(key in aliases),
      );
      expect(missing, `field ${list} tanpa kolom`).toEqual([]);
    }
  });

  it("alias turunan pada sub-fitur selalu sama dengan sumbernya", () => {
    const sample = loadSample("roadmap-generate-ready.json");
    if (!isRecord(sample) || !Array.isArray(sample.subFeatures))
      throw new Error("Contoh tak terduga");
    expect(sample.subFeatures.length).toBeGreaterThan(0);
    for (const item of sample.subFeatures) {
      if (!isRecord(item)) throw new Error("Sub-fitur tak terduga");
      for (const [alias, source] of Object.entries(
        SUBFEATURE_ALIASES.subFeatures ?? {},
      )) {
        expect(item[alias]).toBe(item[source]);
      }
    }
  });

  it("nilai enum pada contoh termasuk nilai yang diizinkan skema", () => {
    const planSample = loadSample("plan-get-after-roadmap.json");
    const roadmap = loadSample("roadmap-generate-ready.json");
    if (!isRecord(planSample) || !isRecord(planSample.plan) || !isRecord(roadmap)) {
      throw new Error("Bentuk contoh tidak terduga");
    }
    expect(plans.status.enumValues).toContain(planSample.plan.status);
    expect(plans.language.enumValues).toContain(planSample.plan.language);
    const first = Array.isArray(roadmap.features) ? roadmap.features[0] : undefined;
    if (!isRecord(first)) throw new Error("Contoh roadmap tanpa fitur");
    expect(features.status.enumValues).toContain(first.status);
    expect(features.source.enumValues).toContain(first.source);
  });

  it("jawaban pertanyaan klarifikasi cocok dengan bentuk kolom question_answers", () => {
    const sample = loadSample("plan-patch-questionAnswers.json");
    if (!isRecord(sample) || !isRecord(sample.questionAnswers))
      throw new Error("Contoh tak terduga");
    const { questions, answers } = sample.questionAnswers;
    expect(Array.isArray(questions)).toBe(true);
    expect(isRecord(answers)).toBe(true);
    for (const question of questions as unknown[]) {
      expect(isRecord(question) && Object.keys(question).sort()).toEqual([
        "id",
        "options",
        "question",
        "required",
        "type",
      ]);
    }
  });
});
