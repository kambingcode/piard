/**
 * Klien HTTP bertipe untuk `/api/agent/*` (ADR 0017). Tidak tahu soal MCP; galat diterjemahkan jadi
 * pesan yang berguna bagi agen. Token hanya ada di header `Authorization` dan tidak pernah dicetak.
 */

import type { McpConfig } from "./config.ts";

export const TASK_STATUSES = ["todo", "doing", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskNote = {
  id: string;
  author: "agent" | "user";
  kind: "note" | "report" | "question" | "event";
  body: string;
  tokenLabel: string | null;
  createdAt: string;
};

export type TaskSummary = {
  id: string;
  featureId: string;
  featureName: string;
  title: string;
  status: TaskStatus;
  position: number;
  claimedByYou: boolean;
};

export type TaskDetail = TaskSummary & {
  description: string;
  prompt: string;
  feature: {
    id: string;
    name: string;
    summary: string;
    phase: number | null;
    spec: string;
    subFeatures: { name: string; summary: string; spec: string }[];
  };
  prdExcerpt: string | null;
  notes: TaskNote[];
  instructions: string | null;
  truncated: string[];
};

export type PlanOverview = {
  plan: {
    id: string;
    title: string;
    idea: string;
    language: string;
    techStack: string[];
  };
  progress: Record<TaskStatus, number>;
  features: {
    id: string;
    name: string;
    summary: string;
    phase: number | null;
    taskCount: number;
  }[];
  instructions: string | null;
  you: { label: string; holding: TaskSummary | null };
};

export type ReportInput = {
  summary: string;
  verification: string;
  filesChanged?: string[];
};

/** Galat API Piard dengan pesan siap tampil ke agen. */
export class PiardApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PiardApiError";
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

type Fetch = (request: Request) => Promise<Response>;

function messageFor(status: number, serverMessage: string | undefined): string {
  if (serverMessage) return serverMessage;
  if (status === 401) return "Token Piard ditolak. Minta pengguna membuat token baru.";
  if (status === 404) return "Tidak ditemukan di plan ini.";
  if (status === 429) return "Terlalu banyak permintaan. Tunggu beberapa menit.";
  return `Piard menjawab dengan galat ${status}.`;
}

export function createPiardClient(
  config: McpConfig,
  options: { fetch?: Fetch; timeoutMs?: number } = {},
) {
  const doFetch: Fetch = options.fetch ?? ((request) => fetch(request));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const request = new Request(`${config.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    let response: Response;
    try {
      response = await doFetch(request);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new PiardApiError(
        0,
        timedOut
          ? `Piard tidak menjawab dalam ${Math.round(timeoutMs / 1000)} detik.`
          : `Tidak bisa menghubungi Piard di ${config.baseUrl}. Pastikan Piard berjalan dan PIARD_URL benar.`,
      );
    }
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!response.ok) {
      const serverMessage =
        json &&
        typeof json === "object" &&
        "error" in json &&
        typeof json.error === "string"
          ? json.error
          : undefined;
      throw new PiardApiError(
        response.status,
        messageFor(response.status, serverMessage),
      );
    }
    if (json === undefined) {
      throw new PiardApiError(
        response.status,
        "Piard menjawab dengan isi yang bukan JSON.",
      );
    }
    // Bentuk respons dijamin kontrak `/api/agent/*` (docs/api.md); server ini tidak mengulang skemanya.
    return json as T;
  }

  const task = (id: string) => `/api/agent/tasks/${encodeURIComponent(id)}`;

  return {
    overview: () => call<PlanOverview>("GET", "/api/agent/plan"),
    listTasks(filter: { status?: TaskStatus; featureId?: string } = {}) {
      const query = new URLSearchParams();
      if (filter.status) query.set("status", filter.status);
      if (filter.featureId) query.set("featureId", filter.featureId);
      const suffix = query.size > 0 ? `?${query}` : "";
      return call<{ tasks: TaskSummary[] }>("GET", `/api/agent/tasks${suffix}`);
    },
    nextTask: () =>
      call<{ task: TaskDetail | null; alreadyClaimed: boolean }>(
        "GET",
        "/api/agent/tasks/next",
      ),
    getTask: (id: string) => call<{ task: TaskDetail }>("GET", task(id)),
    getPrd: () =>
      call<{ prd: { version: number; content: string; truncated: boolean } | null }>(
        "GET",
        "/api/agent/documents/prd",
      ),
    claim: (id: string) => call<{ task: TaskDetail }>("POST", `${task(id)}/claim`),
    report: (id: string, input: ReportInput) =>
      call<{ task: TaskSummary }>("POST", `${task(id)}/report`, input),
    release: (id: string, reason: string) =>
      call<{ task: TaskSummary }>("POST", `${task(id)}/release`, { reason }),
    addNote: (id: string, kind: "note" | "question", body: string) =>
      call<{ note: TaskNote }>("POST", `${task(id)}/notes`, { kind, body }),
  };
}

export type PiardClient = ReturnType<typeof createPiardClient>;
