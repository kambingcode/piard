export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** Di atas ini tabel LCS terlalu besar untuk dihitung di browser; diff jatuh ke "semua diganti". */
const MAX_CELLS = 4_000_000;

/**
 * Perbedaan per baris dari `before` ke `after` (subsekuens bersama terpanjang). Urutan hasil mengikuti
 * dokumen: baris yang dihapus muncul sebelum baris pengganti pada posisi yang sama.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((text) => ({ kind: "removed" as const, text })),
      ...b.map((text) => ({ kind: "added" as const, text })),
    ];
  }
  // lcs[i][j] = panjang LCS a[i..] dan b[j..], disimpan datar.
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a[i] ?? "";
    const right = b[j] ?? "";
    if (left === right) {
      out.push({ kind: "same", text: left });
      i++;
      j++;
    } else if ((lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + j + 1] ?? 0)) {
      out.push({ kind: "removed", text: left });
      i++;
    } else {
      out.push({ kind: "added", text: right });
      j++;
    }
  }
  for (; i < a.length; i++) out.push({ kind: "removed", text: a[i] ?? "" });
  for (; j < b.length; j++) out.push({ kind: "added", text: b[j] ?? "" });
  return out;
}

export type DiffBlock =
  | { kind: "lines"; lines: DiffLine[] }
  | { kind: "collapsed"; count: number };

/**
 * Melipat baris sama yang panjang menjadi satu penanda, menyisakan `context` baris di sekitar setiap
 * perubahan, agar diff dokumen panjang tetap terbaca.
 */
export function collapseUnchanged(lines: DiffLine[], context = 3): DiffBlock[] {
  const keep = lines.map(() => false);
  lines.forEach((line, index) => {
    if (line.kind === "same") return;
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(lines.length - 1, index + context);
      k++
    )
      keep[k] = true;
  });
  const blocks: DiffBlock[] = [];
  let hidden = 0;
  let shown: DiffLine[] = [];
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (hidden > 0) {
        blocks.push({ kind: "collapsed", count: hidden });
        hidden = 0;
      }
      shown.push(line);
    } else {
      if (shown.length > 0) {
        blocks.push({ kind: "lines", lines: shown });
        shown = [];
      }
      hidden++;
    }
  });
  if (shown.length > 0) blocks.push({ kind: "lines", lines: shown });
  if (hidden > 0) blocks.push({ kind: "collapsed", count: hidden });
  return blocks;
}
