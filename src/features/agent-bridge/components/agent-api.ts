"use client";

import type { Task } from "@/features/tasks";
import { apiRequest } from "@/lib/api-client";
import type {
  AgentToken,
  BoardMeta,
  CreatedToken,
  ReviewInput,
  TaskNote,
} from "../schemas";

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Panggilan API pengguna fitur jembatan agen (sesi). */
export const agentBridgeApi = {
  board: (planId: string) =>
    apiRequest<BoardMeta>(`/api/plan/agent-board?planId=${encodeURIComponent(planId)}`),
  tokens: (planId: string) =>
    apiRequest<{ tokens: AgentToken[] }>(
      `/api/plan/agent-tokens?planId=${encodeURIComponent(planId)}`,
    ),
  createToken: (planId: string, label: string, ttlDays: number) =>
    apiRequest<CreatedToken>(
      "/api/plan/agent-tokens",
      json("POST", { planId, label, ttlDays }),
    ),
  revokeToken: (id: string) =>
    apiRequest<{ agentToken: AgentToken }>(
      `/api/plan/agent-tokens/${encodeURIComponent(id)}`,
      json("DELETE"),
    ),
  revokeAll: (planId: string) =>
    apiRequest<{ revoked: number }>(
      "/api/plan/agent-tokens/revoke-all",
      json("POST", { planId }),
    ),
  notes: (taskId: string) =>
    apiRequest<{ notes: TaskNote[] }>(
      `/api/plan/tasks/${encodeURIComponent(taskId)}/notes`,
    ),
  addNote: (taskId: string, body: string) =>
    apiRequest<{ note: TaskNote }>(
      `/api/plan/tasks/${encodeURIComponent(taskId)}/notes`,
      json("POST", { body }),
    ),
  review: (taskId: string, input: ReviewInput) =>
    apiRequest<{ task: Task }>(
      `/api/plan/tasks/${encodeURIComponent(taskId)}/review`,
      json("POST", input),
    ),
  release: (taskId: string) =>
    apiRequest<{ task: Task }>(
      `/api/plan/tasks/${encodeURIComponent(taskId)}/release`,
      json("POST"),
    ),
  saveInstructions: (planId: string, agentInstructions: string) =>
    apiRequest<unknown>(
      `/api/plan/${encodeURIComponent(planId)}`,
      json("PATCH", { agentInstructions }),
    ),
};
