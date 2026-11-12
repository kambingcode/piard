import { baseName, depth, extension } from "./paths";

/** Alasan berkas dilewati; kuncinya dipakai `CodebaseManifest.skipped` dan teks UI. */
export const SKIP_REASONS = [
  "ignored_dir",
  "lockfile",
  "generated",
  "binary",
  "private_key",
  "too_large",
  "too_many",
  /** Metode kompresi ZIP selain stored/deflate (mis. LZMA) atau entri terenkripsi. */
  "unsupported",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** Folder dependensi, hasil build, cache, dan sampah sistem: tidak pernah berisi kode yang ditulis tim. */
const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".astro",
  ".turbo",
  ".vercel",
  ".netlify",
  ".serverless",
  ".expo",
  ".cache",
  ".parcel-cache",
  ".vite",
  "coverage",
  ".nyc_output",
  "storybook-static",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".gradle",
  ".idea",
  ".vscode",
  "Pods",
  "DerivedData",
  ".terraform",
  "__MACOSX",
]);

const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum",
  "mix.lock",
  "pubspec.lock",
  "packages.lock.json",
  "flake.lock",
  "Podfile.lock",
]);

const BINARY_EXTENSIONS = new Set(
  (
    "png jpg jpeg gif webp ico bmp tif tiff avif heic psd ai sketch fig svg " +
    "woff woff2 ttf otf eot " +
    "mp3 mp4 m4a wav ogg oga webm mov avi mkv flac aac " +
    "zip tar gz tgz rar 7z bz2 xz zst jar war ear apk ipa dmg iso " +
    "pdf doc docx xls xlsx ppt pptx odt ods key numbers pages " +
    "exe dll so dylib bin o a lib obj class pyc pyo pyd wasm node " +
    "sqlite sqlite3 db mdb parquet avro pkl npy npz h5 onnx pt ckpt safetensors"
  ).split(" "),
);

/** Berkas kredensial: dilewati utuh, bukan disensor sebagian. */
const PRIVATE_KEY_EXTENSIONS = new Set([
  "pem",
  "key",
  "p12",
  "pfx",
  "jks",
  "keystore",
  "ppk",
  "asc",
  "gpg",
]);
const PRIVATE_KEY_NAMES = new Set([
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  ".netrc",
  "_netrc",
  ".pgpass",
  ".htpasswd",
]);

/**
 * Alasan berkas dilewati hanya dari jalurnya, atau null. Dipakai pengekstrak ZIP sebelum mengurai isi
 * (agar `node_modules` tidak pernah diurai) dan oleh `scanRepo` sebagai pemeriksaan ulang.
 */
export function skipReasonForPath(path: string): SkipReason | null {
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? "";
  if (segments.slice(0, -1).some((s) => IGNORED_DIRS.has(s))) return "ignored_dir";
  if (name === ".DS_Store" || name === "Thumbs.db" || name.startsWith("._"))
    return "ignored_dir";
  if (LOCKFILES.has(name)) return "lockfile";
  if (/\.min\.(js|css|mjs)$/i.test(name) || /\.(map|snap)$/i.test(name))
    return "generated";
  const ext = extension(path);
  if (PRIVATE_KEY_NAMES.has(name) || PRIVATE_KEY_EXTENSIONS.has(ext))
    return "private_key";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  return null;
}

/** Berkas berisi variabel lingkungan; nilainya disensor, namanya dipertahankan. */
export function isEnvFile(path: string): boolean {
  const name = baseName(path);
  return /^\.env(\..+)?$/i.test(name) || /\.env$/i.test(name) || name === ".envrc";
}

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  swift: "Swift",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  hpp: "C++",
  dart: "Dart",
  ex: "Elixir",
  exs: "Elixir",
  scala: "Scala",
  lua: "Lua",
  r: "R",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "CSS",
  sass: "CSS",
  less: "CSS",
  sql: "SQL",
  prisma: "Prisma",
  graphql: "GraphQL",
  gql: "GraphQL",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  tf: "Terraform",
  yml: "YAML",
  yaml: "YAML",
  json: "JSON",
  toml: "TOML",
  xml: "XML",
  md: "Markdown",
  mdx: "Markdown",
};

/** Format data/markup: dihitung di manifes, tetapi bukan "bahasa pemrograman" proyek. */
export const NON_PROGRAMMING = new Set([
  "YAML",
  "JSON",
  "TOML",
  "XML",
  "Markdown",
  "HTML",
  "CSS",
]);

export function languageOf(path: string): string | null {
  const name = baseName(path);
  if (name === "Dockerfile" || name.startsWith("Dockerfile.")) return "Docker";
  if (name === "Makefile") return "Make";
  return LANGUAGES[extension(path)] ?? null;
}

export const KEY_KINDS = [
  "readme",
  "manifest",
  "config",
  "entry",
  "schema",
  "route",
  "docs",
] as const;
export type KeyKind = (typeof KEY_KINDS)[number];

const MANIFESTS = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "pubspec.yaml",
  "mix.exs",
  "deno.json",
]);

/**
 * Jenis berkas kunci (dibaca lebih dulu saat analisis), atau null. Jalur relatif terhadap akar repo
 * (sesudah folder pembungkus dilepas).
 */
export function keyKindOf(path: string): KeyKind | null {
  const name = baseName(path);
  const lower = path.toLowerCase();
  const level = depth(path);

  if (/^readme(\.[a-z]+)?$/i.test(name) && level <= 1) return "readme";
  if (MANIFESTS.has(name)) return "manifest";
  if (
    /^(tsconfig|jsconfig)(\..+)?\.json$/.test(name) ||
    /^(next|vite|nuxt|svelte|astro|remix|webpack|tailwind|drizzle)\.config\.[cm]?[jt]s$/.test(
      name,
    ) ||
    /^docker-compose.*\.ya?ml$/.test(name) ||
    /^compose\.ya?ml$/.test(name) ||
    name === "Dockerfile" ||
    /^(vercel\.json|netlify\.toml|fly\.toml|railway\.(json|toml)|render\.yaml|wrangler\.toml|app\.yaml|serverless\.ya?ml|Procfile|firebase\.json)$/.test(
      name,
    ) ||
    /^\.env\.(example|sample|template)$/.test(name)
  ) {
    return "config";
  }
  // Hanya titik masuk di akar atau satu tingkat (`src/main.ts`, `app/main.py`) dan `cmd/<nama>/main.go`;
  // `index.ts` di setiap folder fitur bukan titik masuk aplikasi (ditemukan saat memindai repo ini).
  // Diperiksa sebelum aturan rute karena lebih sempit (`cmd/api/main.go` bukan berkas rute).
  const language = languageOf(path);
  if (
    (level <= 1 || /^cmd\/[^/]+\/main\.[a-z]+$/.test(path)) &&
    /^(main|index|app|server|cli|manage|wsgi|asgi)\.[a-z]+$/.test(name) &&
    language !== null &&
    !NON_PROGRAMMING.has(language)
  ) {
    return "entry";
  }
  if (
    name === "schema.prisma" ||
    /(^|\/)(migrations?|models?|entities|schema)\//.test(lower) ||
    /schema\.(ts|js|py|sql|graphql|rb)$/.test(lower) ||
    name === "models.py"
  ) {
    return "schema";
  }
  if (
    /(^|\/)(routes?|api|controllers?|handlers?|endpoints?)\//.test(lower) ||
    /(^|\/)route\.[jt]s$/.test(lower) ||
    name === "urls.py" ||
    /router\.[a-z]+$/.test(lower)
  ) {
    return "route";
  }
  if (
    (/^docs?\//.test(lower) && /\.(md|mdx)$/.test(lower)) ||
    /^(contributing|architecture|changelog)\.md$/i.test(name)
  ) {
    return "docs";
  }
  return null;
}

/** Urutan baca: berkas kunci lebih dulu (indeks kecil), lalu sisanya. */
export const keyPriority = (kind: KeyKind | null): number =>
  kind === null ? KEY_KINDS.length : KEY_KINDS.indexOf(kind);
