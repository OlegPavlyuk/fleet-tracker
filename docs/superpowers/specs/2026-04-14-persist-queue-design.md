# Persist Queue — Design Spec (v1 Step 9)

**Date:** 2026-04-14  
**Status:** Approved

---

## Context

The ingest WebSocket receives telemetry from drones at ~1 msg/sec/drone (50 drones in v1).
Every message must be stored in the PostGIS `telemetry` table for the history endpoint (Step 11).
Writing synchronously on each message would couple ingest latency to DB latency — unacceptable for a real-time system.

---

## Goal

A write-behind persist queue that:

- Accepts telemetry entries from `onTelemetry` without blocking ingest
- Batches inserts into Postgres (≤500 ms **or** ≥100 entries, whichever comes first)
- Never lets a slow/failing DB impact the WS ingest path
- Bounds memory via a ring-buffer (max 1000 entries); fresh data always wins

---

## Design

### Module layout

```
apps/api/src/persist/
  queue.ts        — PersistQueue class
  db-deps.ts      — makePersistDeps(): PersistDeps with real Drizzle batchInsert
  index.ts        — re-exports
```

### `TelemetryEntry` type

```ts
type TelemetryEntry = {
  droneId: string;
  ts: number; // Unix ms
  lat: number;
  lng: number;
  altitude_m: number;
  heading_deg: number;
  speed_mps: number;
  battery_pct: number;
};
```

### `PersistDeps` interface

```ts
interface PersistDeps {
  batchInsert: (rows: TelemetryEntry[]) => Promise<void>;
}
```

Injected at construction — real Drizzle impl for prod, in-memory fake for tests.

### `PersistQueue` class

**Constants:**
| Name | Value | Rationale |
|---|---|---|
| `MAX_BUFFER` | 1000 | ~20 s of data at 50 drones/s before eviction |
| `FLUSH_SIZE` | 100 | Trigger immediate flush on burst |
| `FLUSH_INTERVAL_MS` | 500 | Max latency before flush under low load |

**Internal state:**

```ts
private entries: TelemetryEntry[] = [];
private isFlushing = false;
private droppedWrites = 0;
private timer: NodeJS.Timeout;
```

**`push(entry)`:**

1. If `entries.length >= MAX_BUFFER` → `entries.shift()` (evict oldest) + `droppedWrites++`
2. `entries.push(entry)`
3. If `entries.length >= FLUSH_SIZE` → `void this.flush()`

**`flush()`** (private, async):

```ts
if (isFlushing || entries.length === 0) return;
isFlushing = true;
const batch = entries.splice(0); // atomic drain (JS single-threaded)
try {
  await batchInsert(batch);
} catch (err) {
  logger.error({ err, count: batch.length }, 'persist flush failed — batch dropped');
  droppedWrites += batch.length;
} finally {
  isFlushing = false;
}
```

`isFlushing` flag prevents concurrent flushes — if the interval fires while a flush is in progress, that tick is skipped silently. Items remain in the buffer and are picked up on the next tick.

**Timer:** `setInterval(() => void this.flush(), FLUSH_INTERVAL_MS)` started in constructor.

**`stop()`:** `clearInterval(timer)` — called during graceful shutdown; one final `await flush()` to drain remaining entries.

**`get droppedWrites()`:** read-only accessor for observability (Step 10 broadcast, future metrics).

### DB implementation (`db-deps.ts`)

Uses Drizzle batch insert with PostGIS `ST_MakePoint`:

```ts
await db.insert(telemetry).values(
  rows.map((r) => ({
    droneId: r.droneId,
    ts: new Date(r.ts),
    position: sql`ST_SetSRID(ST_MakePoint(${r.lng}, ${r.lat}), 4326)`,
    altitudeM: r.altitude_m,
    headingDeg: r.heading_deg,
    speedMps: r.speed_mps,
    batteryPct: r.battery_pct,
  })),
);
```

`position` must use `sql` template — the Drizzle `customType` `toDriver` path is bypassed (see schema.ts comment).

### Wire-up (`index.ts` entrypoint)

```ts
const persistQueue = new PersistQueue(makePersistDeps());

attachIngestWs(server, {
  ...makeDbIngestDeps(),
  onTelemetry: (droneId, msg) => {
    stateManager.update(droneId, msg);
    persistQueue.push({ droneId, ...msg });
  },
});

// Graceful shutdown: drain before exit
await persistQueue.stop();
```

---

## Error handling

| Scenario                    | Behaviour                                                                    |
| --------------------------- | ---------------------------------------------------------------------------- |
| DB insert fails             | Log error + count batch as `droppedWrites`. No retry (avoid infinite loops). |
| Buffer full (ring)          | Evict oldest entry + `droppedWrites++`. Newest data always kept.             |
| Flush concurrent            | `isFlushing` guard skips the tick. Items stay in buffer.                     |
| Shutdown with pending items | `stop()` clears timer + flushes remaining entries once.                      |

---

## Testing strategy

All tests use an injected fake `batchInsert` — no DB, no testcontainers.

| Test                  | Assertion                                                              |
| --------------------- | ---------------------------------------------------------------------- |
| `push` stores entries | after N pushes, fake receives N rows on flush                          |
| Ring-buffer eviction  | pushing 1001 items evicts oldest, `droppedWrites === 1`                |
| Size trigger          | pushing 100 items triggers immediate flush (fake called synchronously) |
| `isFlushing` guard    | second concurrent `flush()` call returns without double-insert         |
| Failed insert         | `droppedWrites` incremented, no throw propagated                       |
| `stop()` drains       | pending entries flushed on `stop()`                                    |

---

## Out of scope (v1)

- Retry with backoff on failed inserts (v7 hardening)
- Metrics export (Prometheus) — `droppedWrites` counter is exposed but not scraped in v1
- Sampling / downsampling under load (considered, deferred per decision 2026-04-14)
