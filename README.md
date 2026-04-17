# Fleet Tracker

Real-time drone fleet tracking platform. A Node.js backend ingests telemetry over WebSocket from a drone emulator, maintains live state in memory, broadcasts updates to subscribers, and persists history in PostGIS. A React dashboard shows a live map and history view.

![CI](https://github.com/OlegPavlyuk/fleet-tracker/actions/workflows/ci.yml/badge.svg)

## Stack

- **Backend**: Node.js 20, Express, `ws`, Drizzle ORM, PostgreSQL 16 + PostGIS 3.4, pino, zod, jose
- **Frontend**: Vite, React 18, TanStack Query, Zustand, MapLibre GL JS
- **Tests**: vitest, supertest, testcontainers, Playwright
- **Tooling**: pnpm workspaces, ESLint, Prettier, Husky, commitlint

## Getting started

```bash
pnpm install
docker compose up -d
pnpm --filter api db:migrate
pnpm dev
```

## Commands

```bash
pnpm test                     # unit tests
pnpm test:integration         # integration tests (requires Docker)
pnpm test:e2e                 # Playwright smoke tests (requires running stack)
pnpm typecheck                # tsc --noEmit across all workspaces
pnpm lint                     # ESLint
pnpm build                    # build all apps
```

## Architecture

```
apps/api          # Express + ws backend
apps/web          # React dashboard
apps/emulator     # Drone simulator CLI
packages/shared   # zod schemas + TS types
```
