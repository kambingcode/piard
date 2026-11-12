import { PRD_SECTIONS } from "../structure";
import type { PrdPromptInput } from "./prd.prompt";

const TEXT = {
  id: {
    overview: (title: string, idea: string) =>
      `${title} membantu pengguna menyelesaikan kebutuhan berikut tanpa repot: ${idea.trim()}`,
    requirements: [
      "- Pengguna bisa mendaftar dan masuk dengan email.",
      "- Data pengguna tersimpan aman dan hanya bisa dilihat pemiliknya.",
      "- Halaman utama terbuka kurang dari 2 detik di koneksi seluler.",
    ],
    flow: [
      "1. Pengguna membuka aplikasi dan mendaftar.",
      "2. Pengguna memakai fitur inti pertama.",
      "3. Pengguna melihat hasilnya dan kembali lagi lewat pengingat.",
    ],
    architecture:
      "Aplikasi web dengan frontend, API server, dan database relasional. Notifikasi dikirim dari server.",
    entity: "Entitas utama aplikasi",
    constraints: [
      "- Desain sederhana dan ramah ponsel.",
      "- Semua akses data melewati API yang memeriksa sesi.",
    ],
    tableHead: "| Tabel | Deskripsi |",
    user: "Pengguna",
    request: "Kirim permintaan",
    ok: "Hasil",
  },
  en: {
    overview: (title: string, idea: string) =>
      `${title} helps users get the following done with less effort: ${idea.trim()}`,
    requirements: [
      "- Users can sign up and sign in with email.",
      "- User data is stored securely and visible only to its owner.",
      "- The main page loads in under 2 seconds on mobile.",
    ],
    flow: [
      "1. The user opens the app and signs up.",
      "2. The user uses the first core feature.",
      "3. The user sees the result and returns through reminders.",
    ],
    architecture:
      "A web app with a frontend, an API server, and a relational database. Notifications are sent from the server.",
    entity: "Main application entity",
    constraints: [
      "- Simple, mobile-friendly design.",
      "- All data access goes through an API that checks the session.",
    ],
    tableHead: "| Table | Description |",
    user: "User",
    request: "Send request",
    ok: "Result",
  },
} as const;

/** PRD palsu deterministik untuk `LLM_MODE=mock`; memakai judul dan fitur roadmap yang sebenarnya. */
export function mockPrd(input: PrdPromptInput): string {
  const t = TEXT[input.language];
  const s = PRD_SECTIONS[input.language];
  const features = input.features.map((f, i) =>
    [
      `${i + 1}. **${f.name}**: ${f.summary}`,
      ...f.subFeatures.slice(0, 4).map((sub) => `   - ${sub.name}: ${sub.summary}`),
    ].join("\n"),
  );
  return [
    `# PRD - ${input.title}`,
    `## 1. ${s[0]}`,
    t.overview(input.title, input.idea),
    `## 2. ${s[1]}`,
    t.requirements.join("\n"),
    `## 3. ${s[2]}`,
    features.join("\n"),
    `## 4. ${s[3]}`,
    t.flow.join("\n"),
    `## 5. ${s[4]}`,
    t.architecture,
    [
      "```mermaid",
      "sequenceDiagram",
      `    participant U as ${t.user}`,
      "    participant W as Web",
      "    participant A as API",
      "    participant D as Database",
      `    U->>W: ${t.request}`,
      "    W->>A: POST /api",
      "    A->>D: INSERT",
      `    A-->>W: ${t.ok}`,
      `    W-->>U: ${t.ok}`,
      "```",
    ].join("\n"),
    `## 6. ${s[5]}`,
    [
      "```mermaid",
      "erDiagram",
      "    USER ||--o{ ITEM : owns",
      "    USER {",
      "        string id PK",
      "        string email",
      "    }",
      "    ITEM {",
      "        string id PK",
      "        string user_id FK",
      "        string name",
      "    }",
      "```",
    ].join("\n"),
    [t.tableHead, "|---|---|", `| USER | ${t.user} |`, `| ITEM | ${t.entity} |`].join(
      "\n",
    ),
    `## 7. ${s[6]}`,
    t.constraints.join("\n"),
  ].join("\n\n");
}

/**
 * Revisi palsu untuk `LLM_MODE=mock`: permintaan ditambahkan sebagai butir di bagian 2 (Kebutuhan),
 * sehingga perubahan terlihat dan struktur tujuh bagian tetap utuh.
 */
export function mockRevision(current: string, instructions: string): string {
  const bullet = `- ${instructions.replace(/\s+/g, " ").trim()}`;
  const next = current.search(/^## 3\. /m);
  if (next === -1) return `${current.trimEnd()}\n\n${bullet}\n`;
  return `${current.slice(0, next).trimEnd()}\n${bullet}\n\n${current.slice(next)}`;
}
