import type { NextConfig } from "next";

// Cache Components sengaja tidak dinyalakan (lihat docs/adr/0005-no-cache-components.md).
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
