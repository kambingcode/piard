/**
 * Titik masuk server MCP Piard (stdio). Jalankan: `PIARD_URL=… PIARD_TOKEN=… node mcp/server.ts`.
 * stdout milik protokol MCP: pesan manusia hanya ke stderr, dan token tidak pernah dicetak.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPiardClient } from "./client.ts";
import { readConfig } from "./config.ts";
import { createPiardMcpServer } from "./tools.ts";

const result = readConfig(process.env);
if (!result.ok) {
  process.stderr.write(`piard-mcp: ${result.error}\n`);
  process.exit(1);
}

const server = createPiardMcpServer(createPiardClient(result.config));
await server.connect(new StdioServerTransport());
