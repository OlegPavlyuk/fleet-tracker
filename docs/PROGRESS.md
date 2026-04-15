# Progress Log

> Single source of truth for **where the project is right now**. Read at session start. Update at session end.

## Current state

- **Active iteration**: v1
- **Current step**: ready to start v1 Step 15 — History view (replay path on map)
- **Branch**: `main`
- **Last session**: 2026-04-15 — v1 Step 14 complete

## Next up

After Iteration 0 finishes:

- [x] **v1 Step 1**: Foundation — pnpm monorepo (root + workspaces), tsconfig base, ESLint, Prettier, Vitest config, `.env.example`
- [x] **v1 Step 2**: `packages/shared` — zod schemas for wire-formats + TS types
- [x] **v1 Step 3**: DB layer — `docker-compose.yml` (PostGIS), Drizzle schema, first migration
- [x] **v1 Step 4**: `apps/api` skeleton — Express + pino + config + error middleware + healthcheck
- [x] **v1 Step 5**: Auth — `/auth/register`, `/auth/login`, `/auth/me`, JWT middleware
- [x] **v1 Step 6**: REST drones — CRUD on `/drones`, scoped by owner
- [x] **v1 Step 7**: WebSocket ingest — `/ws/ingest`, device-token auth, zod validation
- [x] **v1 Step 8**: State manager — in-memory `Map<droneId, StateSnapshot>` + EventEmitter
- [x] **v1 Step 9**: Persist queue — write-behind ring-buffer + dual-trigger flush → Drizzle batch insert
- [x] **v1 Step 10**: Realtime WS — `/ws/stream`, JWT auth, snapshot on connect, update broadcast
- [x] **v1 Step 11**: History endpoint — `GET /telemetry/history?drone_id&from&to[&bbox]`, PostGIS ST_Within + time range
- [x] **v1 Step 12**: `apps/emulator` — drone simulator CLI (auto-provision via REST, N DroneClient WS connections)
- [x] **v1 Step 13**: `apps/web` foundation — Vite + React + react-router + TanStack Query + Zustand auth store + typed API client + Login/Register/Dashboard/History pages
- [x] **v1 Step 14**: Dashboard map — MapLibre GL JS GeoJSON circle layer + `FleetWSClient` + `useFleetWS` hook + `useDroneStore` (Zustand) + `DroneList` sidebar + popup on drone click

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

| Iteration | Status | Summary                                                                                                 |
| --------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 0         | done   | Setup & workflow (CLAUDE.md, hooks, conventions)                                                        |
| v1        | next   | Thin e2e: emulator → ingest → state → broadcast + persist → web. Drizzle + PostGIS, JSON wire, JWT auth |
| v2        | future | Protobuf wire-format, socket.io comparison, geofencing                                                  |
| v3        | future | WASM hot-path (Rust → WASM): geo-calcs, benchmarks                                                      |
| v4        | future | OAuth (Google/GitHub), refresh tokens, multi-tenant, RBAC                                               |
| v5        | future | Performance: 10k drones, NATS JetStream, Prometheus metrics                                             |
| v6        | future | Mission planning: waypoints, ETA, routing, replay video                                                 |
| v7        | future | Production hardening: graceful shutdown, OTel, Grafana, prod images                                     |

## Session log (most recent first)

### 2026-04-15 (session 5)

- Completed v1 Step 14: Dashboard map
- `FleetWSClient` (plain TS class) — WebSocket lifecycle, `snapshot`/`update` message dispatch, `isClosed` guard prevents post-close callbacks
- `useDroneStore` (Zustand) — `Map<droneId, StateSnapshot>`, `selectedId`, `setSnapshot`/`updateDrone`/`selectDrone` actions
- `useFleetWS` hook — creates/cleans up `FleetWSClient` tied to auth token, wires callbacks to store
- `DroneList.tsx` — sidebar reads store + TanStack Query drone names, sorted rows with status colour + battery %, click selects
- `Map.tsx` — MapLibre GeoJSON `circle` layer updated from store, floating popup on select, click on empty map deselects; component named `DroneMap` internally to avoid shadowing the built-in `Map` constructor
- Fixes:
  - `vi.hoisted` needed for mock variables referenced in `vi.mock` factories (temporal dead zone with `const`)
  - Store state changes outside React rendering cycle require `act()` wrapping in tests
  - `vi.fn().mockImplementation(arrowFn)` fails as constructor in vitest 4.x (root workspace) because `Reflect.construct(arrowFn)` is invalid; fixed by using regular `function()` declarations
  - `pool: 'forks'` added to web vitest config to prevent React `act()` conflicts in parallel runs
- 28 new tests (192 total), 0 type errors, 0 lint errors
- Next: v1 Step 15 — History view (replay path on map)

### 2026-04-14

- Brainstormed and chose project: **Drone Fleet Tracker**
- Decided on Variant B for v1: thin e2e + Drizzle + PostGIS
- Approved full plan with Iteration 0 prepended
- Completed Iteration 0: project conventions, git hooks, Claude Code config
- Completed v1 Step 1: monorepo foundation (tsconfig base, ESLint flat config, Vitest v4 projects, workspace scaffolds, .env.example)
- Completed v1 Step 2: packages/shared zod schemas (TelemetryMessage, StateSnapshot, ClientMessage, ServerMessage) + constants + 23 tests
- Context7 MCP connected ✓
- Next: v1 Step 3 — DB layer (docker-compose PostGIS, Drizzle schema, migration)

### 2026-04-15 (session 4)

- Completed v1 Step 13: `apps/web` foundation
- Zustand `useAuthStore` with `persist` middleware → localStorage under `fleet-auth` key
- `http.ts`: thin `request<T>()` wrapper — reads token from store, sets `Authorization` header, throws typed `ApiError`
- `api.ts`: typed endpoint functions for auth, drones, telemetry (all return typed TS interfaces)
- `router.tsx`: `createBrowserRouter` — `/login`, `/register`, `/` (Dashboard), `/drones/:id/history` behind `AppLayout` auth guard
- Shell components: `Map`, `DroneList`, `DroneMarker` (stubs for Step 14), `ws.ts` (stub for Step 14)
- Pages: `Login`, `Register`, `Dashboard` (header + sidebar + map placeholder), `History` (stub)
- Fixed: `router.tsx` needed `ReturnType<typeof createBrowserRouter>` annotation (TS2883 portable type)
- Fixed: test mocks used `async` without `await` — changed to `() => Promise.resolve()`; `vite.config.ts` added to ESLint `allowDefaultProject`
- 23 new web tests, 164 total, 0 type errors, 0 lint errors
- Next: v1 Step 14 — Dashboard map (MapLibre + WS subscription + markers + popup)

### 2026-04-15 (session 3)

- Completed v1 Step 12: `apps/emulator` drone simulator CLI
- Pure flight model in `drone.ts`: random bbox spawn, heading/speed jitter, bbox bounce, 0.1%/s battery drain
- `api.ts`: fetch-based HTTP client — `login` (→ JWT) + `registerDrone` (POST /drones → id + plain-text device token)
- `client.ts`: `DroneClient` — one `ws` connection per drone, setInterval tick loop, auto-reconnect on close
- `index.ts`: CLI entry reads env (EMULATOR_EMAIL, EMULATOR_PASSWORD, DRONE_COUNT, TICK_MS, BBOX), provisions N drones via REST, starts all WS clients, handles SIGINT/SIGTERM
- 14 unit tests (TDD) for flight model, 141 total, 0 type errors, 0 lint errors
- Next: v1 Step 13 — `apps/web` foundation (Vite + React + router + TanStack Query + auth flow)

### 2026-04-15 (session 2)

- Completed v1 Step 11: `GET /telemetry/history` endpoint
- Zod query validation: `drone_id` (UUID), `from`/`to` (Unix ms), optional `bbox` (minLng,minLat,maxLng,maxLat)
- Ownership check: 404 if drone not found, 403 if belongs to another user
- DB deps: Drizzle + PostGIS — `ST_Y/ST_X` for lat/lng projection, `ST_Within(ST_MakeEnvelope(...))` for bbox, ordered by `ts ASC`, limit 5000
- Key lesson: Zod v4 UUID regex is RFC-strict — version digit must be `[1-8]`; test UUIDs must use real version numbers
- Key lesson: Zod v4 errors are under `.issues`, not `.errors`
- 13 new tests, 104 total, 0 type errors, 0 lint errors
- Next: v1 Step 12 — `apps/emulator` drone simulator CLI

### 2026-04-15

- Completed v1 Step 10: realtime WS (`/ws/stream`)
- JWT auth via `?token=` query param; closes 4401 on missing/invalid token
- Sends `{ type: 'snapshot', payload: StateSnapshot[] }` on connect (full current state)
- Subscribes to `StateManager` `state-changed` events → broadcasts `{ type: 'update', payload: StateSnapshot }` to all open clients
- Cleans up listener on close; verified with `listenerCount` assertion
- Key test pattern: `makeMessageCollector` buffers WS messages from creation to avoid race where server's snapshot arrives in the same TCP burst as the HTTP 101 upgrade response
- Fixed pre-existing lint errors in `persist/queue.test.ts` (`require-await` on sync `batchInsert` mocks)
- 7 new tests, 114 total, 0 type errors, 0 lint errors
- Next: v1 Step 11 — history endpoint (`/telemetry/history`)

### 2026-04-14 (session 7)

- Completed v1 Step 9: write-behind persist queue
- Ring-buffer (1000 max, newest wins), dual-trigger flush (500 ms interval OR 100 items)
- `isFlushing` guard prevents concurrent DB writes (key design decision with user)
- `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` for PostGIS inserts via Drizzle `sql` template
- `stop()` drains remaining entries before DB pool closes (graceful shutdown order)
- 8 new tests, 107 total, 0 type errors
- Next: v1 Step 10 — realtime WS (`/ws/stream`, broadcast to subscribers)

### 2026-04-14 (session 6)

- Completed v1 Step 8: StateManager — `Map<droneId, StateSnapshot>` + EventEmitter
- `update()` derives status from battery_pct (>20% → active, ≤20% → idle), emits `state-changed`
- Wired into ingest `onTelemetry` callback in `index.ts`
- 12 new tests, 99 total, 0 type errors
- Next: v1 Step 9 — persist queue (write-behind batching → Drizzle)

### 2026-04-14 (session 5)

- Completed v1 Step 7: /ws/ingest WebSocket — device token auth (SHA-256 hash lookup), TelemetryMessageSchema validation, closes 4401/1003 on errors, onTelemetry callback for Steps 8+9
- 6 new tests (real WS connections, injected in-memory deps), 64 total
- Next: v1 Step 8 — state manager (in-memory Map + EventEmitter)

### 2026-04-14 (session 4)

- Completed v1 Step 6: REST drones CRUD — GET/POST/PATCH/DELETE /drones, all behind requireAuth, scoped to owner
- POST generates SHA-256-hashed device token, returns plaintext once
- DroneDeps injection pattern (same as AuthDeps) — 15 new tests, no testcontainers
- 58 tests passing, 0 type errors, 0 lint errors
- Next: v1 Step 7 — WebSocket ingest (emulator → /ws/ingest, telemetry persist)

### 2026-04-14 (session 3)

- Completed v1 Step 5: auth module — argon2 password hashing, jose HS256 JWT, requireAuth middleware, /auth/register + /auth/login + /auth/me routes
- Routes use injected AuthDeps interface (Drizzle impl for prod, in-memory fake for tests — no testcontainers needed)
- argon2 native build approved via pnpm-workspace.yaml `onlyBuiltDependencies`
- 43 tests passing (20 new auth tests), 0 type errors, 0 lint errors
- Next: v1 Step 6 — REST drones CRUD (/drones, scoped by owner)

### 2026-04-14 (session 2)

- Completed v1 Step 3: docker-compose.yml (postgis/postgis:16-3.4), Drizzle schema (users, drones, telemetry with PostGIS geometry + GIST index, zones), first migration applied
- Note: Drizzle `customType` quotes geometry type names in generated SQL — manually fixed migration to use unquoted `geometry(POINT, 4326)`. This is a known drizzle-kit limitation with PostGIS.
- Completed v1 Step 4: apps/api skeleton — config.ts (zod fail-fast env validation), logger.ts (pino), typed domain errors (AppError hierarchy), Express app factory (createApp), /health endpoint, central error middleware, graceful shutdown in index.ts
- Added vitest test-setup.ts with minimum env vars for tests that transitively import config.ts
- 46 tests passing (23 shared + 23 api), 0 type errors, 0 lint errors
- Next: v1 Step 5 — Auth (/auth/register, /auth/login, /auth/me, JWT middleware)
