/** Cuplikan siap salin untuk menghubungkan Claude Code ke Piard (M8-08). Fungsi murni, aman untuk klien. */

export type AgentConnection = {
  /** Alamat Piard yang dijangkau server MCP, mis. `http://localhost:3000`. */
  baseUrl: string;
  /** Hanya mesin yang sama yang bisa menjangkau `baseUrl`. */
  local: boolean;
  /** Jalur absolut `app/mcp/server.ts` di mesin ini. */
  serverPath: string;
};

const TOKEN_PLACEHOLDER = "ppl_…";
/** Ekspansi variabel lingkungan di `.mcp.json` Claude Code (bukan template literal JavaScript). */
const TOKEN_FROM_ENV = ["$", "{PIARD_TOKEN}"].join("");

/** Satu argumen shell aman dikutip (jalur bisa mengandung spasi). */
function shellQuote(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * `claude mcp add` (lingkup local: tersimpan di konfigurasi Claude Code pengguna, bukan di repo) dan
 * contoh `.mcp.json` yang membaca token dari variabel lingkungan sehingga aman di-commit.
 */
export function buildSnippets(connection: AgentConnection, token: string | null) {
  const value = token ?? TOKEN_PLACEHOLDER;
  const command = [
    "claude mcp add --transport stdio piard",
    `--env PIARD_URL=${shellQuote(connection.baseUrl)}`,
    `--env PIARD_TOKEN=${shellQuote(value)}`,
    `-- node ${shellQuote(connection.serverPath)}`,
  ].join(" \\\n  ");
  const mcpJson = JSON.stringify(
    {
      mcpServers: {
        piard: {
          type: "stdio",
          command: "node",
          args: [connection.serverPath],
          env: { PIARD_URL: connection.baseUrl, PIARD_TOKEN: TOKEN_FROM_ENV },
        },
      },
    },
    null,
    2,
  );
  const exportToken = `export PIARD_TOKEN=${shellQuote(value)}`;
  return { command, mcpJson, exportToken };
}
