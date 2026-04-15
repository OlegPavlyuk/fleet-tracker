# v1 Step 16 — Tests: Integration + WS Contract + E2E Smoke

**Date**: 2026-04-15
**Scope**: Complete the v1 test layer — integration tests with real PostGIS, WS contract roundtrip, full pipeline consistency check, and Playwright smoke E2E.

---

## Context

Steps 1–15 deliver 219 unit/component tests using in-memory fakes. All REST routes, state logic, and React components are covered at the unit level. Step 16 adds the missing layers:

- **Integration tests** — Drizzle queries + PostGIS spatial functions against a real DB
- **WS contract test** — ingest → state → realtime broadcast roundtrip
- **Pipeline consistency test** — ingest → state → persist queue → DB write → WS fanout
- **E2E smoke** — Playwright register → login → history path

---

## 1. Integration Tests (testcontainers + PostGIS)

### Isolation model

Each test file starts and stops its **own** `testcontainers` PostGIS instance. No shared container, no shared Drizzle client between files. Prevents state leakage and flaky ordering.

Pattern per file:

```ts
let container: StartedPostgreSQLContainer;
let db: DrizzleDb;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
  db = createDrizzleClient(container.getConnectionUri());
  await runMigrations(db);
  await seedData(db); // explicit per-file seed, no shared helpers
}, 60_000);

afterAll(async () => {
  await container.stop();
});
```

### File: `telemetry-history.integration.test.ts`

Seed: 1 user (`userA`), 1 drone (`droneA`), 5 telemetry rows:

- 3 inside Kyiv bbox `[30.30, 50.35, 30.70, 50.55]`
- 2 outside (e.g. London coordinates)
- All within the test `from`/`to` time range

Assertions:

- Time range filter returns all 5 rows when range is wide enough
- Time range filter returns 0 rows when range excludes all rows
- Bbox filter returns only the 3 inside points
- Ownership check: `userB`'s token returns 403 for `droneA`
- Unknown `drone_id` returns 404

### File: `drones.integration.test.ts`

Seed: 1 user (`userA`).

Assertions:

- `POST /drones` inserts a row, returns `{ id, deviceToken }` (plaintext token)
- Token stored as SHA-256 hash (query DB directly to verify)
- `PATCH /drones/:id` updates `name`
- `DELETE /drones/:id` removes the row
- `DELETE /drones/:id` by non-owner returns 403
- After `DELETE /drones/:id`, a subsequent `GET /drones` returns an empty list (row is gone)

---

## 2. WS Contract Test

### File: `ws-contract.test.ts`

Full in-process HTTP+WS server. Uses random OS-assigned port via `server.listen(0)` — address extracted from `server.address()` after listen.

**Message accumulator (no ordering assumptions):**

```ts
function collectMessages(ws: WebSocket, count: number, maxWaitMs = 5000): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const collected: ServerMessage[] = [];
    const timer = setTimeout(() => resolve(collected), maxWaitMs);
    ws.on('message', (raw) => {
      collected.push(JSON.parse(raw.toString()) as ServerMessage);
      if (collected.length >= count) {
        clearTimeout(timer);
        resolve(collected);
      }
    });
    ws.on('error', reject);
  });
}
```

**Test: snapshot on connect**

1. Start server
2. Register user → JWT
3. Connect stream WS with `?token=<jwt>`
4. `collectMessages(streamWs, 1, 3000)`
5. Assert collected contains exactly one message with `type === 'snapshot'`

**Test: update after ingest**

1. Start server
2. Register user → POST drone → get device token + JWT
3. Connect stream WS, collect snapshot
4. Connect ingest WS with `Authorization: Bearer <deviceToken>`
5. Send 1 valid `TelemetryMessage`
6. `collectMessages(streamWs, 1, 3000)` — collect next message
7. Assert: `{ type: 'update', payload: { droneId, battery_pct, ... } }` matches sent values

**Teardown (afterAll — one server lifecycle per describe block):**

```ts
ingestWs.close();
streamWs.close();
await new Promise((r) => server.close(r));
// queue.stop() called inside server shutdown
```

---

## 3. Pipeline Consistency Test

### File: `pipeline.integration.test.ts`

Own PostGIS container. Wires **real** state manager + **real** persist queue + **real** realtime broadcaster in-process. Tests the full data path under minimal load.

**Key design constraint — explicit flush, no timer wait:**

The persist queue must expose `flush(): Promise<void>` in addition to the existing `stop()`:

```ts
// apps/api/src/persist/queue.ts (new method)
async flush(): Promise<void> {
  if (this.buffer.length === 0) return;
  await this.doFlush();  // same logic as interval trigger, but immediate
}
```

**Test: N messages in → N broadcasts + N DB rows**

1. Start full in-process server (own port), own DB container
2. Register user → POST drone → get device token + JWT
3. Connect stream WS
4. `collectMessages(streamWs, 1, 3000)` — drain the snapshot
5. Connect ingest WS
6. Send **N=10** `TelemetryMessage` frames
7. `const updates = await collectMessages(streamWs, 10, 5000)`
8. Assert `updates` has 10 items, all `type === 'update'`, all matching `droneId`
9. `await queue.flush()` — explicit drain, no timer dependency
10. Query `telemetry` table: assert 10 rows for `drone_id`

Teardown: same pattern as WS contract test — close connections, server, container.

---

## 4. Playwright Smoke E2E

### Stack assumption

Playwright tests run against a **pre-running, deterministic stack**:

- `docker compose up -d` starts PostGIS
- API: `pnpm --filter api build && node apps/api/dist/index.js`
- Web: `pnpm --filter web build && pnpm --filter web preview`
- Ports set via env vars (`API_PORT`, `WEB_PORT`) — fixed in docker compose + vite preview config

**No `webServer` in `playwright.config.ts`**. Tests assume the stack is up.

`pnpm --filter web test:e2e` runs Playwright. Never `pnpm dev` in CI.

### playwright.config.ts

```ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:5173',
    actionTimeout: 10_000,
  },
  timeout: 30_000,
});
```

### Test data — explicit seeding per test

Each test seeds its own user + drone via API calls in `test.beforeAll`. No reliance on existing DB state.

```ts
test.beforeAll(async ({ request }) => {
  await request.post('/auth/register', { data: { email, password } });
  const { token } = await request.post('/auth/login', ...).json();
  const { id: droneId } = await request.post('/drones', ..., headers: { Authorization }).json();
  // Seed 5 telemetry rows via POST /test/seed-telemetry (mounted only in NODE_ENV=test)
  await request.post('/test/seed-telemetry', {
    data: { droneId, points: FIVE_SAMPLE_POINTS },
    headers: { Authorization: `Bearer ${token}` },
  });
});
```

For telemetry seeding: add `POST /test/seed-telemetry` to a dedicated test-only router, mounted only when `NODE_ENV === 'test'`. Body: `{ droneId, points: TelemetryMessage[] }`. The route writes directly via Drizzle (bypasses the persist queue). Never mounted in production.

### File: `e2e/smoke.spec.ts`

**Test 1 — Auth flow + dashboard visible**

1. Navigate to `/register`
2. Fill email + password, submit
3. Assert: redirected to `/`, map canvas (`canvas` element) is visible

**Test 2 — History path visible**

1. Login with seeded user
2. Navigate to `/drones/:droneId/history`
3. Click "Last 5 min" preset
4. Click "Load"
5. Assert: stats bar is visible and shows ≥ 1 point (text matches `/\d+\s*points/i`)

---

## 5. New scripts

```json
// root package.json
"test:e2e": "pnpm --filter web test:e2e",
"test:integration": "pnpm --filter api test:integration"

// apps/api/package.json
"test:integration": "vitest run --project integration"

// apps/web/package.json
"test:e2e": "playwright test"
```

Vitest config in `apps/api` adds an `integration` project with:

- `include: ['src/__tests__/integration/**/*.test.ts']`
- `testTimeout: 60_000` (container startup)
- `pool: 'forks'` (testcontainers requires separate processes)

---

## 6. CI model (Step 17 preview)

```yaml
jobs:
  unit:
    run: pnpm test

  integration:
    services:
      # testcontainers starts its own containers — Docker-in-Docker or host Docker socket
    run: pnpm test:integration

  e2e:
    run: |
      docker compose up -d
      pnpm --filter api build && node apps/api/dist/index.js &
      pnpm --filter web build && pnpm --filter web preview &
      wait-on http://localhost:3000/health http://localhost:5173
      pnpm test:e2e
```

---

## Acceptance criteria

- [ ] `pnpm test:integration` passes with a running Docker daemon (no manual DB needed)
- [ ] All integration files have independent containers (no cross-file state)
- [ ] WS contract test uses `collectMessages` with explicit timeout, no `sleep`
- [ ] Pipeline test calls `queue.flush()` explicitly before DB assertion
- [ ] Playwright tests seed all data in `beforeAll`, never depend on pre-existing state
- [ ] `pnpm test` (unit) still passes in < 10s without Docker
- [ ] All servers, WS clients, and containers are closed in `afterAll`
