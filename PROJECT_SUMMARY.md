# Fleet Tracker — Project Summary

## Purpose

Real-time drone fleet tracking platform. Portfolio project for upskilling in real-time geospatial backend engineering. Complexity grows incrementally across versions (v1 → v7).

## V1 Core Features

- JWT authentication (register / login / me)
- WebSocket telemetry ingest from drone emulator (`/ws/ingest`, device token auth)
- In-memory state manager — holds latest snapshot per drone, emits `state-changed` events
- Write-behind persist queue — ring buffer with dual-trigger flush (interval + batch size) to PostGIS
- Realtime WebSocket broadcast to dashboard clients (`/ws/stream`, JWT auth, full snapshot on connect)
- REST history endpoint — paginated flight path with time range and optional bounding-box filter
- Drone emulator CLI — synthetic telemetry generator for development and testing
- React dashboard — live map (MapLibre GL, circle layer) + history replay page

## Architecture

```
pnpm monorepo
├── apps/api         Express + ws backend (single process)
│   ├── ingest/      WS server for emulator → state/persist pipeline
│   ├── realtime/    WS server for dashboard ← state broadcast
│   ├── state/       In-memory state manager (EventEmitter)
│   ├── persist/     Ring-buffer persist queue → PostgreSQL/PostGIS
│   ├── auth/        JWT + argon2 password hashing
│   ├── drones/      CRUD REST routes
│   └── telemetry/   History query REST routes
├── apps/web         Vite + React 18 dashboard
├── apps/emulator    CLI drone simulator
└── packages/shared  Zod schemas, TypeScript types, constants
```

**Storage:** PostgreSQL 16 + PostGIS 3.4. Telemetry stored as `GEOMETRY(POINT, 4326)` with GiST spatial index.

## Technology Stack

| Layer    | Libraries                                                             |
| -------- | --------------------------------------------------------------------- |
| Runtime  | Node.js 20+, TypeScript 5 (strict)                                    |
| Backend  | Express, `ws`, Drizzle ORM, zod, pino, jose, argon2                   |
| Frontend | Vite, React 18, TanStack Query, Zustand, MapLibre GL JS, react-router |
| Database | PostgreSQL 16, PostGIS 3.4                                            |
| Tests    | vitest, supertest, testcontainers, Playwright                         |
| Tooling  | pnpm workspaces, ESLint, Prettier, Husky, commitlint                  |
| CI/CD    | GitHub Actions (4 jobs: check, unit, integration, e2e)                |

## Current State

- All 16 v1 steps complete and merged to `main`
- 219 unit tests + 13 integration tests passing
- CI/CD live on GitHub Actions; branch protection on `main` requires check / unit / integration
- E2e tests run on `main` push or manual dispatch

## Known Limitations

- JWT stored in `localStorage` (not httpOnly cookie) — acceptable for internal dashboard, revisit with OAuth in v4
- Single OS process — no horizontal scaling; NATS JetStream targeted for v5 at 10k drone scale
- JSON wire format — no binary encoding; Protobuf comparison planned for v2
- Emulator generates synthetic telemetry only
- No geofencing or alerting

## V2 Focus

1. **Protobuf vs JSON benchmark** — replace JSON wire format with Protocol Buffers on the ingest path; measure throughput and latency delta
2. **socket.io vs raw `ws` comparison** — side-by-side evaluation of reconnection, room management, and overhead
3. **Geofencing alerts** — polygon zone definitions, server-side containment checks, alert events
