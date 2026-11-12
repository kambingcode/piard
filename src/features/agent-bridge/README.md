# Fitur agent-bridge (jembatan agen MCP)

Agen coding (Claude Code) mengambil card kanban lewat server MCP, mengerjakannya di repo pengguna, lalu
melapor; card naik ke **Review** dan hanya pengguna yang memindahkannya ke Selesai. Rancangan, matriks
transisi, batas, dan model ancaman: [ADR 0017](../../../docs/adr/0017-jembatan-agen.md); panduan pasang:
[docs/agent-bridge.md](../../../docs/agent-bridge.md). Server MCP ada di `app/mcp/` (klien HTTP tipis).

**Data:** `plan_agent_tokens` (hash `ppl_…`, label, kedaluwarsa, cabut, jendela batas laju) dan `task_notes`
(laporan, pertanyaan, catatan, peristiwa). Klaim tersimpan di `tasks.agent_token_id`/`claimed_at`, ditulis
hanya oleh fitur `tasks` (`claimForAgent`, `moveForAgent`, `moveOwnedIf`); fitur ini memanggilnya lewat
`tasks/server.ts`. Plan, roadmap, PRD dibaca lewat pintu `server.ts` masing-masing.

**API agen** (`agentRoute`, Bearer saja, badan maks. 64 KB): `/api/agent/plan`, `tasks`, `tasks/next`,
`tasks/:id`, `tasks/:id/{claim,report,release,notes}`, `documents/prd`. **API pengguna** (sesi):
`/api/plan/agent-tokens` (+`/:id`, `/revoke-all`), `/api/plan/agent-board`, `/api/plan/tasks/:id/{notes,
review,release}`. Perubahan card dipancarkan ke SSE `tasks/stream` (event `agent`, `server/events.ts`).

**UI:** `AgentKanban` membungkus `KanbanBoard` lewat slot (kolom Review, penanda AI, "AI butuh jawaban",
"Mungkin macet" + Lepas, Setujui/Minta perbaikan), `TaskDetailSheet` (linimasa + balasan), dan
`ConnectAiDialog` (token sekali tampil, cuplikan `claude mcp add`/`.mcp.json`, instruksi proyek, daftar token).
Tes: `agent-bridge-api`, `agent-bridge-security`, `mcp-server`, `tasks-review`, e2e `kanban-agent.*`.
