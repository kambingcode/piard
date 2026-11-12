import { describe, expect, it } from "vitest";
import { isStale } from "@/features/agent-bridge/components/agent-kanban";
import { buildSnippets } from "@/features/agent-bridge/connect-snippets";
import { clip, prdSectionsMentioning } from "@/features/agent-bridge/server/agent-api";
import type { Task } from "@/features/tasks";

const connection = {
  baseUrl: "http://localhost:3000",
  local: true,
  serverPath: "/Users/saya/piard app/mcp/server.ts",
};
const TOKEN = `ppl_${"a".repeat(43)}`;

describe("cuplikan Hubungkan AI", () => {
  it("perintah claude mcp add memuat URL, token, dan jalur yang dikutip", () => {
    const { command } = buildSnippets(connection, TOKEN);
    expect(command).toContain("claude mcp add --transport stdio piard");
    expect(command).toContain("--env PIARD_URL=http://localhost:3000");
    expect(command).toContain(`--env PIARD_TOKEN=${TOKEN}`);
    expect(command).toContain("-- node '/Users/saya/piard app/mcp/server.ts'");
  });

  it(".mcp.json tidak pernah berisi token mentah; tanpa token memakai placeholder", () => {
    const { mcpJson, exportToken } = buildSnippets(connection, TOKEN);
    expect(mcpJson).not.toContain(TOKEN);
    const parsed = JSON.parse(mcpJson);
    expect(parsed.mcpServers.piard.env).toEqual({
      PIARD_URL: "http://localhost:3000",
      PIARD_TOKEN: ["$", "{PIARD_TOKEN}"].join(""),
    });
    expect(exportToken).toBe(`export PIARD_TOKEN=${TOKEN}`);
    expect(buildSnippets(connection, null).command).toContain("PIARD_TOKEN='ppl_…'");
  });
});

describe("keluaran API agen", () => {
  it("clip memotong dengan penanda", () => {
    expect(clip("abc", 5)).toEqual({ text: "abc", truncated: false });
    expect(clip("abcdefgh", 3)).toEqual({
      text: "abc\n\n[… dipotong 5 karakter]",
      truncated: true,
    });
  });

  it("bagian PRD yang menyebut fitur, tanpa membedakan huruf besar", () => {
    const prd =
      "# PRD\n\n## A\nTentang booking.\n\n## B\nPembayaran.\n\n## C\nBOOKING lagi.";
    const excerpt = prdSectionsMentioning(prd, "Booking") ?? "";
    expect(excerpt).toContain("## A");
    expect(excerpt).toContain("## C");
    expect(excerpt).not.toContain("## B");
    expect(prdSectionsMentioning(prd, "Laporan")).toBeNull();
  });
});

describe("penanda mungkin macet", () => {
  const base: Task = {
    id: "t",
    planId: "p",
    featureId: "f",
    title: "T",
    description: "",
    prompt: "",
    status: "doing",
    position: 0,
    agentTokenId: "tok",
    claimedAt: "2026-10-31T08:00:00.000Z",
    createdAt: "",
    updatedAt: "",
  };
  const at = (iso: string) => Date.parse(iso);

  it("doing milik agen tanpa kabar > 2 jam; catatan agen memperbarui kabar", () => {
    expect(isStale(base, undefined, at("2026-10-31T09:59:00Z"))).toBe(false);
    expect(isStale(base, undefined, at("2026-10-31T10:01:00Z"))).toBe(true);
    const meta = {
      tokenLabel: "L",
      claimedAt: base.claimedAt,
      lastAgentAt: "2026-10-31T09:30:00.000Z",
      openQuestion: false,
      notes: 1,
    };
    expect(isStale(base, meta, at("2026-10-31T10:01:00Z"))).toBe(false);
  });

  it("card pengguna atau bukan doing tidak pernah macet", () => {
    const late = at("2026-11-02T00:00:00Z");
    expect(isStale({ ...base, agentTokenId: null }, undefined, late)).toBe(false);
    expect(isStale({ ...base, status: "review" }, undefined, late)).toBe(false);
  });
});
