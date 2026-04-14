# Progress Log

> Single source of truth for **where the project is right now**. Read at session start. Update at session end.

## Current state

- **Active iteration**: v1 (Iteration 0 complete)
- **Current step**: ready to start v1 Step 1 — Foundation
- **Branch**: `main`
- **Last session**: 2026-04-14 — Iteration 0 setup done

## Next up

After Iteration 0 finishes:

- [ ] **v1 Step 1**: Foundation — pnpm monorepo (root + workspaces), tsconfig base, ESLint, Prettier, Vitest config, `.env.example`
- [ ] **v1 Step 2**: `packages/shared` — zod schemas for wire-formats + TS types
- [ ] **v1 Step 3**: DB layer — `docker-compose.yml` (PostGIS), Drizzle schema, first migration

(Full step list — see `~/.claude/plans/valiant-greeting-rabbit.md` § "Implementation steps v1")

## Completed

### Iteration 0 — Setup & Workflow

(items will be checked off as they land)

- [x] Plan written and approved (`~/.claude/plans/valiant-greeting-rabbit.md`)
- [x] CLAUDE.md created
- [x] PROGRESS.md created
- [x] DECISIONS.md created (з 4 початковими ADR)
- [x] `.gitignore` created
- [x] Git initialized
- [x] Root `package.json` + `pnpm-workspace.yaml` + Prettier config
- [x] `.claude/settings.json` configured (auto-prettier hook + safe-cmd allowlist)
- [x] Husky + lint-staged + commitlint installed (pre-commit, commit-msg, pre-push hooks)
- [x] `docs/superpowers/specs/` directory created

## Open questions / decisions pending

(none yet)

## Roadmap snapshot (for context)

| Iteration | Status      | Summary                                                                                                 |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| 0         | in progress | Setup & workflow (CLAUDE.md, hooks, conventions)                                                        |
| v1        | not started | Thin e2e: emulator → ingest → state → broadcast + persist → web. Drizzle + PostGIS, JSON wire, JWT auth |
| v2        | future      | Protobuf wire-format, socket.io comparison, geofencing                                                  |
| v3        | future      | WASM hot-path (Rust → WASM): geo-calcs, benchmarks                                                      |
| v4        | future      | OAuth (Google/GitHub), refresh tokens, multi-tenant, RBAC                                               |
| v5        | future      | Performance: 10k drones, NATS JetStream, Prometheus metrics                                             |
| v6        | future      | Mission planning: waypoints, ETA, routing, replay video                                                 |
| v7        | future      | Production hardening: graceful shutdown, OTel, Grafana, prod images                                     |

## Session log (most recent first)

### 2026-04-14

- Brainstormed and chose project: **Drone Fleet Tracker**
- Decided on Variant B for v1: thin e2e + Drizzle + PostGIS
- Approved full plan with Iteration 0 prepended
- Completed Iteration 0: project conventions, git hooks, Claude Code config
- Next session: start v1 Step 1 (Foundation — workspaces tsconfig/eslint/vitest)
- **User action pending**: підключити Context7 MCP (`claude mcp add context7 --transport http https://mcp.context7.com/mcp`)
