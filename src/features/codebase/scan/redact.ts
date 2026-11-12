import { isEnvFile } from "./rules";

/** Pengganti nilai rahasia. Sama untuk semua jenis agar keluaran model tidak bisa membedakannya. */
export const REDACTED = "[DISEMBUNYIKAN]";

type Rule = { pattern: RegExp; replace: (match: string, ...groups: string[]) => string };

const whole = () => REDACTED;

/**
 * Pola rahasia yang dikenal. Urutan penting: blok kunci privat lebih dulu agar pola lain tidak memotong
 * isinya. Semua pola global; sengaja condong ke "terlalu banyak disensor" (privasi lebih penting
 * daripada satu baris dokumentasi yang hilang).
 */
const RULES: Rule[] = [
  {
    pattern:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
    replace: whole,
  },
  { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: whole },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, replace: whole },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g, replace: whole },
  { pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, replace: whole },
  { pattern: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, replace: whole },
  { pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/g, replace: whole },
  { pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, replace: whole },
  { pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g, replace: whole },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: whole },
  { pattern: /\bnpm_[A-Za-z0-9]{36}\b/g, replace: whole },
  // OpenAI (`sk-proj-…`), Anthropic (`sk-ant-…`), OpenRouter (`sk-or-…`), dan sejenisnya.
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replace: whole },
  // Token agen Piard sendiri (ADR 0016 `pcb_`, ADR 0017 `ppl_`): prompt atau `.mcp.json` yang tertinggal
  // di repo tidak boleh terkirim ulang.
  { pattern: /\b(?:pcb|ppl)_[A-Za-z0-9_-]{20,}/g, replace: whole },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    replace: whole,
  },
  // Kredensial di URL: `postgres://user:sandi@host` → `postgres://[DISEMBUNYIKAN]@host`.
  {
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@"'`]+:[^\s@/"'`]+@/gi,
    replace: (_m, scheme = "") => `${scheme}${REDACTED}@`,
  },
  // `.npmrc`: `//registry/:_authToken=…`.
  {
    pattern: /(_authToken|_auth|_password)(\s*=\s*)[^\s"']+/g,
    replace: (_m, key = "", eq = "") => `${key}${eq}${REDACTED}`,
  },
  // Nilai literal untuk nama yang berbau rahasia: `apiKey: "…"`, `DB_PASSWORD = '…'`, `"secret": "…"`.
  {
    pattern:
      /([A-Za-z0-9_]*(?:api[_-]?key|apikey|secret|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|token|password|passwd|pwd|private[_-]?key|credentials?)["']?\s*[:=]\s*)(["'`])([^"'`\n]{6,})\2/gi,
    replace: (_m, prefix = "", quote = "") => `${prefix}${quote}${REDACTED}${quote}`,
  },
];

/** Baris `KEY=nilai` (opsional `export `) di berkas env. */
const ENV_LINE = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*)(.*)$/;

function redactEnv(text: string): { text: string; count: number } {
  let count = 0;
  const lines = text.split("\n").map((line) => {
    const match = ENV_LINE.exec(line);
    if (!match) return line;
    const [, key = "", value = ""] = match;
    const bare = value.trim().replace(/^["']|["']$/g, "");
    if (bare === "" || bare === REDACTED) return line;
    count += 1;
    return `${key}${REDACTED}`;
  });
  return { text: lines.join("\n"), count };
}

/**
 * Mengganti rahasia di isi berkas dengan {@link REDACTED}. Berkas env disensor per baris (nama variabel
 * tetap ada untuk halaman "Cara menjalankan"); berkas lain lewat pola yang dikenal.
 *
 * @returns teks tersensor dan jumlah penggantian.
 */
export function redactSecrets(
  path: string,
  input: string,
): { text: string; count: number } {
  let text = input;
  let count = 0;
  if (isEnvFile(path)) {
    const env = redactEnv(text);
    text = env.text;
    count += env.count;
  }
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match, ...rest: unknown[]) => {
      // `rest` = grup tangkapan, lalu offset dan string utuh (pola di sini tanpa grup bernama).
      // Dipotong berdasarkan posisi, bukan disaring, agar grup yang tidak cocok tidak menggeser urutan.
      const groups = rest.slice(0, -2).map((g) => (typeof g === "string" ? g : ""));
      const replaced = rule.replace(match, ...groups);
      if (replaced !== match) count += 1;
      return replaced;
    });
  }
  return { text, count };
}
