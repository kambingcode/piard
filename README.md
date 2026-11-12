# Piard

Piard turns a one-paragraph product idea into a PRD, a phased feature roadmap, feature specs, and task
prompts you can paste straight into an AI coding agent. I built it for my own use, so it runs as a single
Next.js app with a SQLite file and one owner account.

The UI, code comments, and most of the docs in `docs/` are in Indonesian. This README is the English
entry point.

## What it does

You start with an idea. Piard asks which stack you want (or lets the AI pick), then asks five clarifying
questions. From your answers it builds a roadmap: features grouped by phase, shown as a graph you can
edit. The roadmap streams in while the model is still writing it.

Next comes the PRD. It has seven sections and Mermaid diagrams, and it streams too. You can edit it,
browse past versions, diff two versions, and download it as Markdown.

For each feature, Piard writes a spec and a list of tasks. Every task has a ready-to-paste prompt. Tasks
live on a kanban board, and the whole set exports as a ZIP. Progress comes over server-sent events, so
you can watch features fill in one by one.

A revision chat sits next to the PRD. It can rewrite the PRD directly and propose roadmap changes, which
you accept or reject.

Other parts:

- Existing projects. Point Piard at a ZIP upload, a public GitHub URL, or a local Claude Code session. It
  writes ten pages of editable, versioned docs about the codebase, and new plans can use those docs as
  context.
- Agent bridge. A small MCP server (`mcp/`) lets Claude Code pull the next `todo` card, claim it, do the
  work in your repo, and report back. The card then moves to Review, where you approve it or send it back
  with notes. Setup is in [docs/agent-bridge.md](docs/agent-bridge.md).
- Cost control. AI usage is tracked per plan, with optional daily and monthly USD limits.
- Settings page for picking a model per task without restarting the server.
- Command palette on Ctrl/⌘ K.

## Stack

Next.js 16 (App Router), TypeScript in strict mode, Tailwind CSS v4 with Radix primitives, Drizzle on
better-sqlite3, and the Vercel AI SDK. Models are called through OpenRouter, or straight to Anthropic for
`claude-*` model IDs. Tooling: pnpm, Biome, Vitest, Playwright, and dependency-cruiser to enforce import
boundaries.

## Running it

You need Node.js 22+ and pnpm.

```bash
pnpm install
cp .env.example .env   # defaults to LLM_MODE=mock: fake deterministic output, no keys, no cost
pnpm dev               # http://localhost:3000, migrations run on boot
```

Open `/sign-up` and create the owner account. Only the first account is allowed. If you'd rather skip
that, `pnpm db:seed` creates a dev account (`dev@piard.local`).

To use real models, set `LLM_MODE=openrouter` in `.env`, add `OPENROUTER_API_KEY` and/or
`ANTHROPIC_API_KEY`, and fill in every `MODEL_*` variable. `pnpm llm:check` makes one small call to
confirm the setup works. `.env.example` explains each variable, and
[docs/runbook.md](docs/runbook.md) covers backups and model swaps. Keep your keys in `.env`. That file
is git-ignored.

## Checks and tests

```bash
pnpm check      # typecheck + lint + import boundaries + unit/integration tests
pnpm e2e        # Playwright against a production build (uses your installed Chrome)
```

`pnpm eval:roadmap`, `eval:prd`, `eval:build`, `eval:chat`, and `eval:codebase` run the AI pipeline
against real models and score the output. They cost a few cents each run. The roadmap, PRD, and build
evals read sample fixtures that aren't in this repo, so they won't run from a fresh clone. A few contract
tests that compare against those same samples are skipped when the samples are missing.

Other scripts: `pnpm docs:api` regenerates [docs/api.md](docs/api.md) from the Zod schemas (a test fails
if it's stale), `pnpm db:generate` creates a migration from `src/server/db/schema.ts`, and `pnpm build`
does a production build.

## Layout

```
src/app/         Next.js routing only: thin pages, route handlers around 30 lines
src/features/    one folder per feature: components, server code, schemas, copy, README
src/server/      shared server infrastructure: config, settings, db, ai, jobs, http, logger
src/components/  UI primitives, layout shell, shared patterns
src/lib/         pure functions
mcp/             stdio MCP server for the agent bridge (plain HTTP client, no DB access)
tests/           unit, integration, contract, e2e
evals/           real-model evaluations
docs/            architecture, ADRs, API reference, AI pipeline, UI guidelines, runbook
```

Each feature has two entry points: `index.ts` for anything safe to import on the client, and `server.ts`
for server-only code. API routes can only import from `server.ts` and the shared HTTP helpers.
dependency-cruiser and `tests/unit/architecture.test.ts` both enforce this, so a bad import fails
`pnpm check`.

## Docs (Indonesian)

- [docs/architecture.md](docs/architecture.md): layers, import rules, data flow
- [docs/adr/](docs/adr/): architecture decisions and the reasons behind them
- [docs/api.md](docs/api.md): every endpoint, generated from the Zod schemas
- [docs/ai-pipeline.md](docs/ai-pipeline.md): prompts, schemas, model per task, eval results
- [docs/ui-guidelines.md](docs/ui-guidelines.md): tokens, component patterns, UX criteria
- [docs/runbook.md](docs/runbook.md): running, backups, switching models, adding keys
- [docs/agent-bridge.md](docs/agent-bridge.md): connecting Claude Code to the kanban
- [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md): working rules for AI coding agents in this repo
