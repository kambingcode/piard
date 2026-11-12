import type { TechArea } from "./schemas";

/** Pilihan pada langkah "Preferensi teknologi". "Biarkan AI pilih" ditambahkan UI sebagai nilai bawaan. */
export const TECH_OPTIONS: Record<TechArea, string[]> = {
  backend: [
    "Next.js (route handler)",
    "Node.js (Express / Fastify)",
    "Laravel (PHP)",
    "Django / FastAPI (Python)",
    "Go",
    "Supabase / Firebase",
  ],
  database: ["PostgreSQL", "MySQL", "SQLite", "MongoDB", "Supabase", "Firebase"],
  frontend: [
    "React / Next.js",
    "Vue / Nuxt",
    "Svelte / SvelteKit",
    "Flutter",
    "React Native",
  ],
  deployment: [
    "Vercel",
    "VPS / Docker",
    "Cloudflare",
    "Railway / Render",
    "Firebase Hosting",
  ],
};

export const EXTRA_OPTIONS = [
  "Login dan akun",
  "Pembayaran",
  "Unggah file",
  "Email dan notifikasi",
  "Real-time",
  "Panel admin",
  "Multi-bahasa",
  "Analitik",
];
