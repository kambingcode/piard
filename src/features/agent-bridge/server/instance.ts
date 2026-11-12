import "server-only";

import { redactSecrets } from "@/features/codebase/server";
import { getPlansService } from "@/features/plans/server";
import { getPrdService } from "@/features/prd/server";
import { getRoadmapService } from "@/features/roadmap/server";
import { getTasksService } from "@/features/tasks/server";
import { type AgentApiService, createAgentApiService } from "./agent-api";
import { type BoardService, createBoardService } from "./board";
import { publishBoardEvent } from "./events";
import { getAgentBridgeRepo } from "./repo";
import { createTokenService, type TokenService } from "./tokens";

let tokens: TokenService | undefined;
let agentApi: AgentApiService | undefined;
let board: BoardService | undefined;

export function getTokenService(): TokenService {
  tokens ??= createTokenService({ repo: getAgentBridgeRepo(), plans: getPlansService() });
  return tokens;
}

export function getAgentApiService(): AgentApiService {
  agentApi ??= createAgentApiService({
    repo: getAgentBridgeRepo(),
    plans: getPlansService(),
    roadmap: getRoadmapService(),
    prd: getPrdService(),
    tasks: getTasksService(),
    redact: redactSecrets,
    publish: publishBoardEvent,
  });
  return agentApi;
}

export function getBoardService(): BoardService {
  board ??= createBoardService({
    repo: getAgentBridgeRepo(),
    tasks: getTasksService(),
    tokens: getTokenService(),
    publish: publishBoardEvent,
  });
  return board;
}
