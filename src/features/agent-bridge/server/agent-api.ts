import "server-only";

import { chosenTech, planTitle } from "@/features/plans";
import type { PlansService } from "@/features/plans/server";
import type { PrdService } from "@/features/prd/server";
import type { RoadmapService } from "@/features/roadmap/server";
import type { Task, TaskStatus } from "@/features/tasks";
import type { AgentMove, TasksService } from "@/features/tasks/server";
import { AppError } from "@/server/http/errors";
import { agentBridgeCopy } from "../copy";
import {
  NOTES_PER_TASK_MAX,
  PRD_EXCERPT_MAX,
  PRD_OUT_MAX,
  SPEC_OUT_MAX,
} from "../limits";
import type { AgentNoteInput, ReportInput, TaskEvent, TaskNote } from "../schemas";
import type { BoardEvent } from "./events";
import type { AgentBridgeRepo, TaskNoteRow } from "./repo";
import type { AgentSession } from "./tokens";

/** Sensor rahasia milik fitur codebase (M7), disuntikkan lewat pintu `server.ts`. */
export type Redact = (path: string, text: string) => { text: string; count: number };

type Deps = {
  repo: AgentBridgeRepo;
  plans: Pick<PlansService, "getPlan">;
  roadmap: Pick<RoadmapService, "getRoadmap">;
  prd: Pick<PrdService, "getPrd">;
  tasks: Pick<
    TasksService,
    | "listInPlan"
    | "findInPlan"
    | "heldByAgent"
    | "nextTodo"
    | "claimForAgent"
    | "moveForAgent"
  >;
  redact: Redact;
  publish: (event: BoardEvent) => void;
  now?: () => Date;
};

export type AgentTaskSummary = {
  id: string;
  featureId: string;
  featureName: string;
  title: string;
  status: TaskStatus;
  position: number;
  /** Task ini sedang dipegang token yang bertanya. */
  claimedByYou: boolean;
};

export type AgentTaskDetail = AgentTaskSummary & {
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
  /** Bagian PRD yang menyebut nama fitur; PRD penuh lewat `GET /api/agent/documents/prd`. */
  prdExcerpt: string | null;
  notes: TaskNote[];
  instructions: string | null;
  /** Field yang dipotong karena melewati batas keluaran. */
  truncated: string[];
};

export type AgentPlanOverview = {
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
  you: { label: string; holding: AgentTaskSummary | null };
};

/** Memotong teks dengan penanda yang jelas bagi agen. */
export function clip(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return {
    text: `${text.slice(0, max)}\n\n[… dipotong ${text.length - max} karakter]`,
    truncated: true,
  };
}

/** Bagian `## …` PRD yang menyebut `name` (tanpa membedakan huruf besar), digabung lalu dipotong. */
export function prdSectionsMentioning(prd: string, name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const sections = prd.split(/^(?=## )/m).filter((s) => s.toLowerCase().includes(needle));
  if (sections.length === 0) return null;
  return clip(sections.join("\n").trim(), PRD_EXCERPT_MAX).text;
}

export function toTaskNote(row: TaskNoteRow): TaskNote {
  return {
    id: row.id,
    taskId: row.taskId,
    author: row.author,
    kind: row.kind,
    body: row.body,
    tokenLabel: row.tokenLabel,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Laporan agen sebagai satu catatan Markdown (dirender aman di kanban). */
function reportBody(input: ReportInput): string {
  const copy = agentBridgeCopy.report;
  const parts = [input.summary, `**${copy.verification}:**\n\n${input.verification}`];
  if (input.filesChanged.length > 0) {
    parts.push(
      `**${copy.filesChanged}:**\n\n${input.filesChanged.map((f) => `- \`${f.replaceAll("`", "")}\``).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

/**
 * API agen (ADR 0017): baca konteks plan untuk satu task dan transisi terbatas (klaim, lapor, lepas,
 * catatan). Semua akses memakai `session.planId` dari token; izin hanya dari token + matriks transisi
 * di fitur `tasks`, tidak pernah dari isi plan.
 */
export function createAgentApiService(deps: Deps) {
  const { repo, plans, roadmap, prd, tasks, redact, publish } = deps;
  const now = deps.now ?? (() => new Date());

  /** Teks plan yang keluar ke agen disensor dulu (rahasia yang tak sengaja ditempel pengguna). */
  const safe = (text: string) => redact("piard-plan.md", text).text;
  const taskNotFound = () =>
    new AppError("NOT_FOUND", agentBridgeCopy.agent.taskNotFound);

  function featureNames(session: AgentSession) {
    return new Map(
      roadmap
        .getRoadmap(session.userId, session.planId)
        .features.map((f) => [f.id, f.name] as const),
    );
  }

  function summarize(
    session: AgentSession,
    task: Task,
    names: Map<string, string>,
  ): AgentTaskSummary {
    return {
      id: task.id,
      featureId: task.featureId,
      featureName: names.get(task.featureId) ?? "",
      title: task.title,
      status: task.status,
      position: task.position,
      claimedByYou: task.status === "doing" && task.agentTokenId === session.token.id,
    };
  }

  function instructionsOf(session: AgentSession): string | null {
    const text = plans.getPlan(session.userId, session.planId).plan.agentInstructions;
    return text ? safe(text) : null;
  }

  function noteForAgent(note: TaskNote): TaskNote {
    if (note.kind !== "event") return { ...note, body: safe(note.body) };
    const code = note.body as TaskEvent; // `body` event selalu kode dari TASK_EVENTS (ditulis server).
    return { ...note, body: agentBridgeCopy.events[code] ?? note.body };
  }

  function detail(session: AgentSession, task: Task): AgentTaskDetail {
    const state = roadmap.getRoadmap(session.userId, session.planId);
    const feature = state.features.find((f) => f.id === task.featureId);
    const names = new Map(state.features.map((f) => [f.id, f.name] as const));
    const truncated: string[] = [];
    const spec = clip(safe(feature?.spec ?? ""), SPEC_OUT_MAX);
    if (spec.truncated) truncated.push("feature.spec");
    const document = prd.getPrd(session.userId, session.planId).document;
    const excerpt =
      document && feature
        ? prdSectionsMentioning(safe(document.content), feature.name)
        : null;
    return {
      ...summarize(session, task, names),
      description: safe(task.description),
      prompt: safe(task.prompt),
      feature: {
        id: task.featureId,
        name: feature?.name ?? "",
        summary: safe(feature?.summary ?? ""),
        phase: feature?.phase ?? null,
        spec: spec.text,
        subFeatures: state.subFeatures
          .filter((s) => s.parentId === task.featureId)
          .map((s) => ({
            name: s.name,
            summary: safe(s.summary),
            spec: clip(safe(s.spec), SPEC_OUT_MAX).text,
          })),
      },
      prdExcerpt: excerpt,
      notes: repo.listNotes(task.id).map(toTaskNote).map(noteForAgent),
      instructions: instructionsOf(session),
      truncated,
    };
  }

  function event(session: AgentSession, task: Task, code: TaskEvent) {
    repo.insertNote({
      taskId: task.id,
      planId: session.planId,
      author: "agent",
      kind: "event",
      body: code,
      tokenId: session.token.id,
      createdAt: now(),
    });
  }

  function requireNoteRoom(taskId: string, adding: number) {
    if (repo.countNotes(taskId) + adding > NOTES_PER_TASK_MAX) {
      throw new AppError(
        "CONFLICT",
        agentBridgeCopy.errors.tooManyNotes(NOTES_PER_TASK_MAX),
      );
    }
  }

  /** Penolakan transisi menjadi pesan yang menyebut langkah benar berikutnya. */
  function moved(
    move: AgentMove,
    mode: "claim" | "own",
  ): { task: Task; already: boolean } {
    switch (move.kind) {
      case "ok":
        return { task: move.task, already: move.already };
      case "not_found":
        throw taskNotFound();
      case "busy":
        throw new AppError(
          "CONFLICT",
          agentBridgeCopy.agent.busy(move.held.title, move.held.id),
        );
      case "conflict":
        throw new AppError(
          "CONFLICT",
          mode === "claim"
            ? agentBridgeCopy.agent.claimConflict(move.task.status)
            : agentBridgeCopy.agent.notYours(move.task.status),
        );
    }
  }

  function incoming(text: string): string {
    return redact("catatan-agen.md", text).text;
  }

  return {
    overview(session: AgentSession): AgentPlanOverview {
      const { plan } = plans.getPlan(session.userId, session.planId);
      const state = roadmap.getRoadmap(session.userId, session.planId);
      const all = tasks.listInPlan(session.planId);
      const names = new Map(state.features.map((f) => [f.id, f.name] as const));
      const progress: Record<TaskStatus, number> = {
        todo: 0,
        doing: 0,
        review: 0,
        done: 0,
      };
      const perFeature = new Map<string, number>();
      for (const task of all) {
        progress[task.status] += 1;
        perFeature.set(task.featureId, (perFeature.get(task.featureId) ?? 0) + 1);
      }
      const holding = tasks.heldByAgent(session.planId, session.token.id);
      return {
        plan: {
          id: plan.id,
          title: safe(planTitle(plan)),
          idea: safe(plan.idea),
          language: plan.language,
          techStack: chosenTech(plan.techStack),
        },
        progress,
        features: state.features.map((f) => ({
          id: f.id,
          name: f.name,
          summary: safe(f.summary),
          phase: f.phase,
          taskCount: perFeature.get(f.id) ?? 0,
        })),
        instructions: plan.agentInstructions ? safe(plan.agentInstructions) : null,
        you: {
          label: session.token.label,
          holding: holding ? summarize(session, holding, names) : null,
        },
      };
    },

    listTasks(
      session: AgentSession,
      filter: { status?: TaskStatus; featureId?: string },
    ): AgentTaskSummary[] {
      const names = featureNames(session);
      return tasks
        .listInPlan(session.planId, filter.featureId)
        .filter((t) => filter.status === undefined || t.status === filter.status)
        .map((t) => summarize(session, t, names));
    },

    /** Task yang sedang dipegang token (bila ada), selain itu task `todo` berikutnya. */
    next(session: AgentSession): {
      task: AgentTaskDetail | null;
      alreadyClaimed: boolean;
    } {
      const held = tasks.heldByAgent(session.planId, session.token.id);
      if (held) return { task: detail(session, held), alreadyClaimed: true };
      const next = tasks.nextTodo(session.planId);
      return { task: next ? detail(session, next) : null, alreadyClaimed: false };
    },

    getTask(session: AgentSession, id: string): AgentTaskDetail {
      const task = tasks.findInPlan(session.planId, id);
      if (!task) throw taskNotFound();
      return detail(session, task);
    },

    getPrd(session: AgentSession): {
      prd: { version: number; content: string; truncated: boolean } | null;
    } {
      const document = prd.getPrd(session.userId, session.planId).document;
      if (!document) return { prd: null };
      const content = clip(safe(document.content), PRD_OUT_MAX);
      return {
        prd: {
          version: document.version,
          content: content.text,
          truncated: content.truncated,
        },
      };
    },

    claim(session: AgentSession, id: string): AgentTaskDetail {
      const { task, already } = moved(
        tasks.claimForAgent(session.planId, id, session.token.id, now()),
        "claim",
      );
      if (!already) {
        event(session, task, "claim");
        publish({
          planId: session.planId,
          taskId: task.id,
          status: task.status,
          reason: "claim",
        });
      }
      return detail(session, task);
    },

    report(session: AgentSession, id: string, input: ReportInput): AgentTaskSummary {
      requireNoteRoom(id, 2);
      const { task, already } = moved(
        tasks.moveForAgent(session.planId, id, session.token.id, "review"),
        "own",
      );
      if (!already) {
        repo.insertNote({
          taskId: task.id,
          planId: session.planId,
          author: "agent",
          kind: "report",
          body: incoming(reportBody(input)),
          tokenId: session.token.id,
          createdAt: now(),
        });
        event(session, task, "report");
        publish({
          planId: session.planId,
          taskId: task.id,
          status: task.status,
          reason: "report",
        });
      }
      return summarize(session, task, featureNames(session));
    },

    release(session: AgentSession, id: string, reason: string): AgentTaskSummary {
      requireNoteRoom(id, 2);
      const { task } = moved(
        tasks.moveForAgent(session.planId, id, session.token.id, "todo"),
        "own",
      );
      repo.insertNote({
        taskId: task.id,
        planId: session.planId,
        author: "agent",
        kind: "note",
        body: incoming(reason),
        tokenId: session.token.id,
        createdAt: now(),
      });
      event(session, task, "release");
      publish({
        planId: session.planId,
        taskId: task.id,
        status: task.status,
        reason: "release",
      });
      return summarize(session, task, featureNames(session));
    },

    /** Catatan atau pertanyaan pada task yang sedang dipegang token ini. */
    addNote(session: AgentSession, id: string, input: AgentNoteInput): TaskNote {
      const task = tasks.findInPlan(session.planId, id);
      if (!task) throw taskNotFound();
      if (task.status !== "doing" || task.agentTokenId !== session.token.id) {
        throw new AppError("CONFLICT", agentBridgeCopy.agent.notYours(task.status));
      }
      requireNoteRoom(task.id, 1);
      const note = repo.insertNote({
        taskId: task.id,
        planId: session.planId,
        author: "agent",
        kind: input.kind,
        body: incoming(input.body),
        tokenId: session.token.id,
        createdAt: now(),
      });
      publish({
        planId: session.planId,
        taskId: task.id,
        status: task.status,
        reason: "note",
      });
      return toTaskNote(note);
    },
  };
}

export type AgentApiService = ReturnType<typeof createAgentApiService>;
