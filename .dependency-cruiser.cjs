/**
 * Batas impor Piard (doc 09 bagian 3). Dijalankan lewat `pnpm deps` dan menjadi bagian `pnpm check`.
 * Ringkasan arsitektur dan alasannya ada di docs/architecture.md.
 */

// Pintu publik sebuah fitur: `index.ts` (aman untuk klien) dan `server.ts` (hanya server).
const FEATURE_DOORS = "(index|server)\\.ts$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Dependensi melingkar membuat modul sulit dipahami dan diuji.",
      from: {},
      to: { circular: true },
    },
    {
      name: "pages-no-server-infra",
      severity: "error",
      comment:
        "Halaman, layout, dan komponen di src/app tidak boleh mengimpor src/server. Lewat features/*/server.ts.",
      from: { path: "^src/app/(?!api/)" },
      to: { path: "^src/server/" },
    },
    {
      name: "api-only-http-infra",
      severity: "error",
      comment:
        "Route handler hanya boleh memakai helper src/server/http; logika bisnis lewat features/*/server.ts.",
      from: { path: "^src/app/api/" },
      to: { path: "^src/server/(?!http/)" },
    },
    {
      name: "feature-internals-private-from-outside",
      severity: "error",
      comment: `Di luar fitur, impor fitur hanya lewat features/<fitur>/${FEATURE_DOORS}`,
      from: { pathNot: "^src/features/" },
      to: { path: "^src/features/", pathNot: `^src/features/[^/]+/${FEATURE_DOORS}` },
    },
    {
      name: "feature-internals-private-between-features",
      severity: "error",
      comment: `Antar fitur, impor hanya lewat features/<fitur>/${FEATURE_DOORS}`,
      from: { path: "^src/features/([^/]+)/" },
      to: {
        path: "^src/features/",
        pathNot: [`^src/features/[^/]+/${FEATURE_DOORS}`, "^src/features/$1/"],
      },
    },
    {
      name: "index-no-server-code",
      severity: "error",
      comment: "index.ts aman untuk klien: tidak boleh menarik kode server fitur.",
      from: { path: "^src/features/[^/]+/index\\.ts$" },
      to: { path: ["^src/features/[^/]+/server(/|\\.ts$)", "^src/server/"] },
    },
    {
      name: "client-code-no-server",
      severity: "error",
      comment: "Komponen, hook, dan lib tidak boleh menyentuh kode server.",
      from: {
        path: [
          "^src/components/",
          "^src/lib/",
          "^src/features/[^/]+/(components|hooks)/",
        ],
      },
      to: { path: ["^src/server/", "^src/features/[^/]+/server(/|\\.ts$)"] },
    },
    {
      name: "components-no-features",
      severity: "error",
      comment: "src/components bersifat umum; data fitur masuk lewat props dari halaman.",
      from: { path: "^src/components/" },
      to: { path: "^src/features/" },
    },
    {
      name: "lib-is-pure",
      severity: "error",
      comment: "src/lib berisi fungsi murni dan tidak bergantung pada bagian lain src.",
      from: { path: "^src/lib/" },
      to: { path: "^src/", pathNot: "^src/lib/" },
    },
    {
      name: "server-infra-is-below-features",
      severity: "error",
      comment:
        "src/server adalah infrastruktur; tidak boleh mengimpor fitur, halaman, atau komponen.",
      from: { path: "^src/server/" },
      to: { path: ["^src/features/", "^src/app/", "^src/components/"] },
    },
    {
      name: "database-only-in-repo",
      severity: "error",
      comment:
        "Akses database hanya di repo.ts fitur (atau src/server/db dan src/server/jobs/ai yang mengelola tabelnya sendiri).",
      from: {
        pathNot: [
          "^src/server/",
          "^src/features/[^/]+/server/repo(/|\\.ts$)",
          "^src/features/[^/]+/server/repo\\.[^/]+\\.ts$",
        ],
      },
      to: { path: ["^src/server/db/", "node_modules/(drizzle-orm|better-sqlite3)/"] },
    },
    {
      name: "mcp-is-http-client-only",
      severity: "error",
      comment:
        "Server MCP (app/mcp) hanya klien HTTP untuk /api/agent/* (ADR 0017): tidak boleh mengimpor kode aplikasi.",
      from: { path: "^mcp/" },
      to: { path: "^src/" },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment: "Kode produksi tidak boleh bergantung pada paket devDependencies.",
      from: { path: "^(src|mcp)/", pathNot: "\\.(test|spec)\\.tsx?$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-deprecated-core",
      severity: "warn",
      from: {},
      to: { dependencyTypes: ["core"], path: "^(punycode|domain|constants|sys)$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
    exclude: { path: "\\.(test|spec)\\.tsx?$" },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
