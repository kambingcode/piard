import type { DetectedStack } from "../schemas";
import { baseName } from "./paths";
import { languageOf, NON_PROGRAMMING } from "./rules";

type TextFile = { path: string; text: string; size: number };

/** Paling banyak sekian bahasa disebut (urut menurut ukuran kode). */
const MAX_LANGUAGES = 5;
const MAX_TOOLS = 30;

/** Pasangan [penanda, label]; yang pertama cocok menang, jadi urutan = prioritas. */
type Signals = readonly (readonly [string, string])[];

const FRONTEND: Signals = [
  ["next", "Next.js"],
  ["nuxt", "Nuxt"],
  ["@remix-run/react", "Remix"],
  ["@sveltejs/kit", "SvelteKit"],
  ["astro", "Astro"],
  ["@angular/core", "Angular"],
  ["expo", "React Native (Expo)"],
  ["react-native", "React Native"],
  ["solid-js", "SolidJS"],
  ["svelte", "Svelte"],
  ["vue", "Vue"],
  ["react", "React"],
];

const BACKEND_JS: Signals = [
  ["@nestjs/core", "NestJS"],
  ["fastify", "Fastify"],
  ["hono", "Hono"],
  ["express", "Express"],
  ["koa", "Koa"],
  ["@trpc/server", "tRPC"],
];

const DATABASE_JS: Signals = [
  ["@supabase/supabase-js", "Supabase (PostgreSQL)"],
  ["@neondatabase/serverless", "PostgreSQL (Neon)"],
  ["pg", "PostgreSQL"],
  ["postgres", "PostgreSQL"],
  ["mysql2", "MySQL"],
  ["mysql", "MySQL"],
  ["better-sqlite3", "SQLite"],
  ["sqlite3", "SQLite"],
  ["@libsql/client", "SQLite (libSQL)"],
  ["mongoose", "MongoDB"],
  ["mongodb", "MongoDB"],
  ["firebase-admin", "Firebase"],
  ["firebase", "Firebase"],
];

const TOOLS_JS: Signals = [
  ["typescript", "TypeScript"],
  ["tailwindcss", "Tailwind CSS"],
  ["prisma", "Prisma"],
  ["@prisma/client", "Prisma"],
  ["drizzle-orm", "Drizzle ORM"],
  ["typeorm", "TypeORM"],
  ["sequelize", "Sequelize"],
  ["vite", "Vite"],
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["@playwright/test", "Playwright"],
  ["cypress", "Cypress"],
  ["eslint", "ESLint"],
  ["@biomejs/biome", "Biome"],
  ["zod", "Zod"],
  ["@tanstack/react-query", "TanStack Query"],
  ["redux", "Redux"],
  ["@reduxjs/toolkit", "Redux"],
  ["zustand", "Zustand"],
  ["graphql", "GraphQL"],
  ["socket.io", "Socket.IO"],
  ["ioredis", "Redis"],
  ["redis", "Redis"],
  ["stripe", "Stripe"],
  ["next-auth", "NextAuth"],
  ["better-auth", "Better Auth"],
  ["ai", "Vercel AI SDK"],
];

/** Penanda berbasis teks untuk ekosistem non-JS: [pola dalam berkas manifes, label]. */
type TextSignals = readonly (readonly [RegExp, string])[];

const BACKEND_TEXT: TextSignals = [
  [/\bdjango\b/i, "Django"],
  [/\bfastapi\b/i, "FastAPI"],
  [/\bflask\b/i, "Flask"],
  [/github\.com\/gin-gonic\/gin/, "Gin"],
  [/github\.com\/labstack\/echo/, "Echo"],
  [/github\.com\/gofiber\/fiber/, "Fiber"],
  [/^\s*axum\s*=/m, "Axum"],
  [/^\s*actix-web\s*=/m, "Actix Web"],
  [/^\s*rocket\s*=/m, "Rocket"],
  [/"laravel\/framework"/, "Laravel"],
  [/"symfony\/framework-bundle"/, "Symfony"],
  [/gem\s+["']rails["']/, "Ruby on Rails"],
  [/gem\s+["']sinatra["']/, "Sinatra"],
  [/spring-boot/, "Spring Boot"],
  [/:phoenix\b/, "Phoenix"],
];

const DATABASE_TEXT: TextSignals = [
  [/\b(psycopg2?|asyncpg)\b/i, "PostgreSQL"],
  [/github\.com\/(lib\/pq|jackc\/pgx)/, "PostgreSQL"],
  [/\bpymongo\b|\bmotor\b/i, "MongoDB"],
  [/go\.mongodb\.org\/mongo-driver/, "MongoDB"],
  [/\bmysqlclient\b|\bpymysql\b/i, "MySQL"],
  [/gem\s+["']pg["']/, "PostgreSQL"],
  [/gem\s+["']sqlite3["']/, "SQLite"],
];

const PRISMA_PROVIDERS: Record<string, string> = {
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  mongodb: "MongoDB",
  sqlserver: "SQL Server",
  cockroachdb: "CockroachDB",
};

const COMPOSE_IMAGES: TextSignals = [
  [/image:\s*["']?(postgres|postgis|timescale)/i, "PostgreSQL"],
  [/image:\s*["']?(mysql|mariadb)/i, "MySQL"],
  [/image:\s*["']?mongo/i, "MongoDB"],
];

/** Berkas penanda deployment, urut prioritas (platform spesifik sebelum Docker generik). */
const DEPLOYMENT_FILES: readonly (readonly [RegExp, string])[] = [
  [/^fly\.toml$/, "Fly.io"],
  [/^railway\.(json|toml)$/, "Railway"],
  [/^render\.yaml$/, "Render"],
  [/^vercel\.json$/, "Vercel"],
  [/^netlify\.toml$/, "Netlify"],
  [/^wrangler\.(toml|jsonc?)$/, "Cloudflare Workers"],
  [/^firebase\.json$/, "Firebase Hosting"],
  [/^Procfile$/, "Heroku"],
  [/^app\.yaml$/, "Google App Engine"],
  [/^serverless\.ya?ml$/, "Serverless Framework"],
  [/^Dockerfile$/, "Docker"],
];

type PackageJson = { dependencies: Set<string>; scripts: string };

function readPackageJson(text: string): PackageJson | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = record[field];
      if (typeof deps === "object" && deps !== null) {
        for (const name of Object.keys(deps)) names.add(name);
      }
    }
    return { dependencies: names, scripts: JSON.stringify(record.scripts ?? {}) };
  } catch {
    return null;
  }
}

const firstSignal = (deps: Set<string>, signals: Signals) =>
  signals.find(([name]) => deps.has(name))?.[1];

const firstText = (text: string, signals: TextSignals) =>
  signals.find(([pattern]) => pattern.test(text))?.[1];

/**
 * Menebak teknologi dari manifes dan berkas penanda (tanpa model). Hasilnya mengisi langkah Teknologi
 * saat merencanakan fitur baru (M7-18) dan menjadi petunjuk untuk analisis; tebakan yang tidak yakin
 * dibiarkan kosong.
 */
export function detectStack(files: readonly TextFile[]): DetectedStack {
  const deps = new Set<string>();
  const manifestText: string[] = [];
  const tools = new Set<string>();
  let database: string | undefined;
  let deployment: string | undefined;
  let deploymentRank = DEPLOYMENT_FILES.length;
  let hasNextRoutes = false;

  for (const file of files) {
    const name = baseName(file.path);
    if (name === "package.json") {
      const pkg = readPackageJson(file.text);
      if (pkg) for (const dep of pkg.dependencies) deps.add(dep);
    } else if (
      /^(requirements.*\.txt|pyproject\.toml|Pipfile|setup\.py|go\.mod|Cargo\.toml|composer\.json|Gemfile|pom\.xml|build\.gradle(\.kts)?|mix\.exs|pubspec\.yaml)$/.test(
        name,
      )
    ) {
      manifestText.push(file.text);
    }

    if (name === "schema.prisma") {
      const provider = /provider\s*=\s*"([a-z]+)"/.exec(
        file.text.slice(file.text.indexOf("datasource")),
      )?.[1];
      if (provider && PRISMA_PROVIDERS[provider]) database ??= PRISMA_PROVIDERS[provider];
      tools.add("Prisma");
    }
    if (/^(docker-)?compose.*\.ya?ml$/.test(name)) {
      tools.add("Docker Compose");
      const fromImage = firstText(file.text, COMPOSE_IMAGES);
      if (fromImage) database ??= fromImage;
      if (/image:\s*["']?redis/i.test(file.text)) tools.add("Redis");
    }
    if (file.path.startsWith(".github/workflows/")) tools.add("GitHub Actions");
    if (/^tsconfig(\..+)?\.json$/.test(name)) tools.add("TypeScript");
    if (/(^|\/)(app\/.*\/route\.[jt]s|pages\/api\/)/.test(file.path))
      hasNextRoutes = true;

    const rank = DEPLOYMENT_FILES.findIndex(([pattern]) => pattern.test(name));
    if (rank !== -1 && rank < deploymentRank) {
      deploymentRank = rank;
      deployment = DEPLOYMENT_FILES[rank]?.[1];
    }
  }

  const allManifests = manifestText.join("\n");
  const frontend =
    firstSignal(deps, FRONTEND) ??
    (/\bflutter\b/.test(allManifests) ? "Flutter" : undefined);
  const backend =
    firstSignal(deps, BACKEND_JS) ??
    firstText(allManifests, BACKEND_TEXT) ??
    (frontend === "Next.js" && hasNextRoutes ? "Next.js (route handler)" : undefined);
  database ??= firstSignal(deps, DATABASE_JS) ?? firstText(allManifests, DATABASE_TEXT);

  for (const [dep, label] of TOOLS_JS) if (deps.has(dep)) tools.add(label);
  // Label yang sudah menjadi frontend/backend/database tidak diulang di daftar alat.
  for (const used of [frontend, backend, database]) if (used) tools.delete(used);

  return {
    languages: topLanguages(files),
    ...(frontend ? { frontend } : {}),
    ...(backend ? { backend } : {}),
    ...(database ? { database } : {}),
    ...(deployment ? { deployment } : {}),
    tools: [...tools].sort().slice(0, MAX_TOOLS),
  };
}

/** Bahasa pemrograman urut menurut total byte; format data hanya dipakai bila tidak ada yang lain. */
function topLanguages(files: readonly TextFile[]): string[] {
  const bytes = new Map<string, number>();
  for (const file of files) {
    const language = languageOf(file.path);
    if (language) bytes.set(language, (bytes.get(language) ?? 0) + file.size);
  }
  const ranked = [...bytes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([language]) => language);
  const programming = ranked.filter((l) => !NON_PROGRAMMING.has(l));
  return (programming.length > 0 ? programming : ranked).slice(0, MAX_LANGUAGES);
}
