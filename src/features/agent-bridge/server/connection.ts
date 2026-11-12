import "server-only";

import { join } from "node:path";
import { getEnv } from "@/server/config/env";
import type { AgentConnection } from "../connect-snippets";

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/;

/**
 * Alamat Piard dan jalur server MCP untuk cuplikan "Hubungkan AI" (M8-08). `APP_URL` bila diisi, selain
 * itu origin yang sedang dibuka pengguna. Jalur server MCP berasal dari folder aplikasi ini; untuk Piard
 * yang di-deploy, pengguna menjalankan salinan repo sendiri (ADR 0017), jadi jalurnya hanya contoh.
 */
export function agentConnection(requestOrigin: string): AgentConnection {
  const baseUrl = getEnv().appUrl ?? new URL(requestOrigin).origin;
  const local = LOCAL_HOST.test(new URL(baseUrl).hostname);
  return { baseUrl, local, serverPath: join(process.cwd(), "mcp", "server.ts") };
}
