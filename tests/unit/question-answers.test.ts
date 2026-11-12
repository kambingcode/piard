import { describe, expect, it } from "vitest";
import type { ClarifyingQuestion } from "@/features/plans";
import {
  hasAnswer,
  isHandled,
  multiOtherText,
  resumeIndex,
  singleOtherText,
  skippedValue,
  toggleOption,
  withMultiOther,
} from "@/features/questions/answers";

const text: ClarifyingQuestion = {
  id: "t",
  question: "?",
  type: "text",
  options: [],
  required: true,
};
const single: ClarifyingQuestion = {
  id: "s",
  question: "?",
  type: "single_choice",
  options: ["a", "b", "c"],
  required: true,
};
const multi: ClarifyingQuestion = {
  id: "m",
  question: "?",
  type: "multi_choice",
  options: ["x", "y", "z"],
  required: true,
};
const all = [text, single, multi];

describe("jawaban pertanyaan", () => {
  it("skippedValue: teks/tunggal kosong, banyak pilihan larik kosong", () => {
    expect(skippedValue(text)).toBe("");
    expect(skippedValue(single)).toBe("");
    expect(skippedValue(multi)).toEqual([]);
  });

  it("isHandled membedakan belum dijawab dari dilewati", () => {
    expect(isHandled(text, {})).toBe(false);
    expect(isHandled(text, { t: "" })).toBe(true);
    expect(isHandled(multi, { m: [] })).toBe(true);
  });

  it("hasAnswer: kosong atau spasi dan larik kosong tidak dihitung", () => {
    expect(hasAnswer(text, {})).toBe(false);
    expect(hasAnswer(text, { t: "   " })).toBe(false);
    expect(hasAnswer(text, { t: "Dewi" })).toBe(true);
    expect(hasAnswer(multi, { m: [] })).toBe(false);
    expect(hasAnswer(multi, { m: [" "] })).toBe(false);
    expect(hasAnswer(multi, { m: ["x"] })).toBe(true);
  });

  it("resumeIndex: pertanyaan pertama yang belum ditangani, atau yang terakhir bila semua sudah", () => {
    expect(resumeIndex(all, {})).toBe(0);
    expect(resumeIndex(all, { t: "ok", s: "" })).toBe(2);
    expect(resumeIndex(all, { t: "ok", s: "a", m: [] })).toBe(2);
    expect(resumeIndex([], {})).toBe(0);
  });

  it("singleOtherText hanya mengembalikan jawaban di luar opsi", () => {
    expect(singleOtherText(single, { s: "a" })).toBe("");
    expect(singleOtherText(single, { s: "lainnya" })).toBe("lainnya");
    expect(singleOtherText(single, { s: "" })).toBe("");
    expect(singleOtherText(single, {})).toBe("");
  });

  it("multi: toggleOption menambah/menghapus, withMultiOther menjaga opsi dan mengganti isian lain", () => {
    expect(toggleOption(undefined, "x")).toEqual(["x"]);
    expect(toggleOption(["x", "y"], "x")).toEqual(["y"]);
    expect(multiOtherText(multi, { m: ["x", "kustom"] })).toBe("kustom");
    expect(withMultiOther(multi, { m: ["x", "kustom"] }, "baru")).toEqual(["x", "baru"]);
    expect(withMultiOther(multi, { m: ["x", "kustom"] }, "  ")).toEqual(["x"]);
    expect(withMultiOther(multi, {}, "solo")).toEqual(["solo"]);
  });
});
