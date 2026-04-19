# V2 — Observability, Metrics & Performance Analysis

**Status**: design approved, ready for implementation plan
**Date**: 2026-04-18
**Project**: Fleet Tracker (drone telemetry pet project)
**Next step after ExitPlanMode**: copy this spec to `docs/superpowers/specs/2026-04-18-v2-observability-design.md`, commit, then invoke `superpowers:writing-plans` for the executable implementation plan.

---

## Context

V1 delivered a functional end-to-end telemetry pipeline: WS ingest → `StateManager` → `persistQueue` (ring buffer, write-behind) → PostGIS, with a separate WS stream fanout. It is correct but **opaque**: no metrics, no correlation IDs, no dashboards, no load tests. We do not know where time is spent, what the real throughput ceiling is, or which component would break first.

V2 shifts focus from _features_ to _system maturity_. The goal is senior-level engineering discipline: make the system observable, run controlled load experiments, and evolve architecture only where data justifies it. The portfolio artifact at the end is a reproducible benchmark log showing before/after numbers — "I measured X dominated at Y%, changed Z, dropped to W%" — rather than "I added protobuf because I thought it would be faster".

Approach: **measure first, optimize by evidence.** Three phases.

---

## Guiding principles

**Mental model**: _We don't optimize the system. We optimize the constraint revealed by measurement._

Seven rules that override convenience throughout V2:

1. **Two separate worlds of truth.** Prometheus/Grafana = authoritative system performance (**production view**). Benchmark harness = experimental, user-perceived latency (**lab view**). Never mixed in decision logic. Web dashboard's e2e latency is **indicative only**, never a baseline.

2. **Phase 1 is strictly four things**: correlation IDs, stage histograms, queue depth + backpressure counters, base dashboards. No "analytics on top of analytics" at this stage — no derived views, no anomaly detection, no UI features beyond committed Grafana JSON.

3. **Phase 3 hard rule**: before any intervention, point to **the metric that proves it is the bottleneck**. Only then: change → benchmark → compare. Without this rule Phase 3 becomes random optimization.

4. **Cardinality control is non-optional.** No new label without explicit rationale. `benchmark_id`, `drone_id`, `reason`, `event` are all subject to review. Unchecked label cardinality is future production pain.

5. **Latency authority model** (explicit and permanent):
   - server metrics = authoritative system performance
   - benchmark e2e = experimental user-perceived latency
   - web dashboard e2e = indicative only

6. **Phase 2 scenarios are frozen** at baseline + ramp + sustained. Spike, soak, high-frequency are unlocked only after a real bottleneck is surfaced — never pre-emptively.

7. **The main risk of V2 is not system complexity — it is over-engineering before the data arrives.** When in doubt, measure, don't build.

---

## Locked-in design decisions

| Decision            | Choice                                                                                                                                                           | Rationale                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Observability stack | **Prometheus + Grafana** via `prom-client`. No tracing/OTel in V2.                                                                                               | Industry-standard, portfolio-credible, no cloud dependency. Tracing deferred — revisit if histograms don't give enough signal. |
| Correlation IDs     | Server-minted `session_id` (UUIDv7) per WS connection; server-minted `msg_id` (UUIDv7) per ingested frame, echoed in broadcast payload.                          | Single source of truth, no client trust issue. Future `traceparent` migration is a pure format change.                         |
| Latency measurement | **Hybrid**: server-internal stage histograms + closed-loop e2e via benchmark harness (single process = single clock). Web dashboard reports indicative-only e2e. | Authoritative numbers without clock-skew games.                                                                                |
| Benchmark identity  | Separate `benchmark_id` field, distinct from `msg_id`. `msg_id` = system truth, `benchmark_id` = test identity.                                                  | Clean separation in logs/analysis.                                                                                             |
| Alerts              | Grafana-native (Phase 1). Alertmanager only if routing/silencing becomes necessary.                                                                              | Lighter footprint, fewer moving parts.                                                                                         |
| Alert thresholds    | Observe-only until baseline benchmark runs; then set from real percentiles.                                                                                      | Avoids "blind" thresholds.                                                                                                     |
| `/metrics` exposure | Gated by bearer token (`METRICS_TOKEN` env).                                                                                                                     | Safe default even for local runs.                                                                                              |
| Target scale        | Soft target **1000 drones @ 1–10 Hz** for Phase 2.                                                                                                               | Stretches single-process v1 without forcing v5 scope (NATS/multi-process).                                                     |
| V2 exit criterion   | 2–4 interventions implemented, each with measured before/after, plus `docs/benchmarks/SUMMARY.md` writeup.                                                       | Bounds V2; forces synthesis at the end.                                                                                        |

---

## Phase 1 — Observability foundation

Goal: make the existing pipeline fully observable with zero behavioural change.

**Scope guardrail** (principle #2): Phase 1 contains exactly these four categories and nothing else.

1. Correlation IDs (§1.1)
2. Stage histograms (§1.2)
3. Queue depth + backpressure counters (§1.2)
4. Base dashboards + `/metrics` endpoint (§1.3–1.5)

Alerts (§1.6) run observe-only; they are not a fifth category — they are a deferred output of Phase 2 baseline data. Anything beyond these — derived analytics, anomaly detection, web-side visualizations, per-drone breakdowns — is Phase 3 or later, and only if data justifies it.

### 1.1 Correlation IDs

- `session_id` (UUIDv7) minted on each `/ws/ingest` and `/ws/stream` accept. Attached via pino `logger.child({ session_id })`. Logged only; never a Prometheus label.
- `msg_id` (UUIDv7) minted server-side on ingest entry _after_ zod validation. Carried through `StateSnapshot`, `persistQueue` item, broadcast payload. Logged at each stage as structured field.
- Shared schema change in `packages/shared`: broadcast payload gains `msg_id: string`, `server_recv_ts: number`, `server_send_ts: number`, `benchmark_id?: string` (echoed verbatim from ingest).

### 1.2 Instrumentation points

| Location                                           | Metric(s)                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/ingest/server.ts` — WS accept        | `ws_ingest_connections` gauge, `ws_connections_total{endpoint,event}` counter                                                                                                                                                                    |
| `apps/api/src/ingest/server.ts` — frame receive    | start pipeline timer; stamp `t_server_recv`                                                                                                                                                                                                      |
| after zod validate                                 | `validate_duration_ms` histogram, `ingest_messages_total{result}` counter                                                                                                                                                                        |
| `apps/api/src/state/manager.ts` — `update()`       | `state_update_duration_ms` histogram                                                                                                                                                                                                             |
| `apps/api/src/persist/queue.ts` — `push()`         | `persist_enqueue_duration_ms` histogram, `persist_queue_size` gauge                                                                                                                                                                              |
| persist queue — flush path                         | `persist_flush_duration_ms` histogram, `persist_batch_size` histogram, `persist_flush_total{result}` counter, **`queue_wait_ms` histogram** (per-item: `t_flush_start - t_enqueue`), expose existing `_droppedWrites` as `persist_dropped_total` |
| `apps/api/src/realtime/server.ts` — broadcast loop | `broadcast_send_duration_ms` histogram, `broadcast_fanout_size` **histogram** (buckets: 1, 10, 50, 100, 500, 1000, 5000), `broadcast_send_failures_total` counter                                                                                |
| broadcast send completion                          | stamp `server_send_ts`; observe `server_ingress_to_broadcast_ms` (server-owned e2e)                                                                                                                                                              |
| `apps/api/src/realtime/server.ts` — WS accept      | `ws_stream_connections` gauge                                                                                                                                                                                                                    |

**Label discipline** (principle #4 — non-optional): allowed labels are `endpoint`, `result`, `reason`, `event` only. **No `drone_id`, no `session_id`, no `msg_id`, no `benchmark_id` as labels** — all of these are high-cardinality IDs and belong in logs, never in metric labels. Any new label requires written rationale.

**Default metrics**: `collectDefaultMetrics()` from `prom-client` gives event-loop lag, GC, heap, CPU, process uptime.

### 1.3 `/metrics` endpoint

- Mounted on the API app, plaintext Prometheus format.
- Gated by `Authorization: Bearer ${METRICS_TOKEN}` header; 401 otherwise.
- Excluded from pino-http request logging.

### 1.4 Infra additions (docker-compose)

- `prometheus` service: `prom/prometheus`, config at `./prometheus/prometheus.yml`, scrape interval 5s, targets `host.docker.internal:3000/metrics`.
- `grafana` service: `grafana/grafana`, provisioning volume at `./grafana/provisioning/` (datasources + dashboards). Dashboards committed as JSON.

### 1.5 Dashboards (provisioned, committed)

- **Pipeline Overview**: throughput (ingest/persist/broadcast rates), **ingest-rate vs persist-rate** panel (same axis, makes debt visible), per-stage latency p50/p95/p99, queue depth over time, `queue_wait_ms` distribution, connection counts, error rates by reason, fanout distribution.
- **System Health**: event-loop lag, heap, GC pauses, CPU, process uptime.

### 1.6 Alerts (Grafana-native, starting set)

All run observe-only until baseline benchmark is committed.

- `p95 server_ingress_to_broadcast_ms > 250ms for 1m` (warn)
- `persist_queue_size > 800 for 30s` (warn)
- `rate(persist_dropped_total[1m]) > 0` (critical — any drop = data loss)
- `rate(broadcast_send_failures_total[1m]) > 1` (warn)
- `validate result=invalid rate > 5/s for 2m` (warn)
- **`nodejs_eventloop_lag_seconds > 0.05 for 30s`** (warn) — early-warning signal before latency degrades

---

## Phase 2 — Load experiments

Goal: turn the system into a measurable subject. Find the first real bottleneck.

### 2.1 Benchmark harness

New workspace `apps/benchmark`. One process, two roles: producer (writes via `/ws/ingest`) + subscriber (reads `/ws/stream`). Closed-loop timing on a single clock.

- Harness adds `benchmark_id` (UUIDv7) to each telemetry payload. Server preserves verbatim in broadcast. Harness correlates sent/received on `benchmark_id`.
- Per-message capture: `t_send`, `t_recv`, `server_recv_ts`, `server_send_ts`, `benchmark_id`.
- Per-sample derived segments: `e2e`, `server_recv→server_send`, `server_send→client_recv`.
- CLI shape: `pnpm bench --scenario <name> --drones N --hz X --duration Ns --api-url ws://... --tag <label> --out docs/benchmarks/`
- Reuses `DroneClient` logic from `apps/emulator/src/client.ts` and `apps/emulator/src/drone.ts` (lifted into a shared utility if needed, or imported directly).

### 2.2 Starting scenario set

Frozen at three scenarios (principle #6). Expansion is data-gated.

1. **baseline** — 10 drones @ 1 Hz, 60s. Quiet-system noise floor. **Must run before any alert threshold is set.**
2. **ramp** — 10 → 100 → 500 → 1000 drones @ 1 Hz, 60s per step. Finds the knee.
3. **sustained** — 1000 drones @ 1 Hz, 5 min. Steady-state creep check.

**Expansion unlock**: spike / soak / high-frequency are added only after `summary.md` has documented a concrete bottleneck observation from the starting set. Never pre-emptively. Never "for completeness".

### 2.3 Artifact layout (per run)

```
docs/benchmarks/YYYY-MM-DD-<scenario>-<tag>/
  config.json          scenario knobs + git SHA + API version + hardware info
  results.json         (schema below)
  metrics-snapshot.txt raw /metrics scrape at end
  summary.md           what changed vs previous, what we learned, proposed next action
```

`docs/benchmarks/INDEX.md` — chronological table: date, scenario, tag, key p95 numbers, link to summary. The lab notebook.

### 2.4 `results.json` schema

```json
{
  "scenario": "sustained",
  "tag": "v2.1-baseline",
  "git_sha": "...",
  "duration_s": 300,
  "drones": 1000,
  "hz": 1,
  "samples": 300000,
  "latency_ms": {
    "e2e":                    { "p50":..., "p95":..., "p99":..., "max":... },
    "server_recv_to_send":    { ... },
    "queue_wait":             { ... },
    "persist_flush":          { ... },
    "send_to_client_recv":    { ... }
  },
  "backpressure": {
    "dropped_total":              0,
    "drop_rate_per_s":            0,
    "queue_growth_rate_per_s":    2.1,
    "ingest_persist_lag_msgs":    450,
    "max_queue_depth":            982
  },
  "counters": { "ingest_ok":..., "persist_rows":..., "broadcast_sent":..., "errors":... },
  "system":   { "event_loop_lag_p99_s":..., "heap_max_mb":..., "gc_pause_p99_ms":... }
}
```

### 2.5 Iteration loop discipline

One iteration = (1) state hypothesis or target, (2) run scenario set, (3) write `summary.md` with findings and proposed next action, (4) commit. No fixes on a hunch. Every Phase 3 change points back to a benchmark row.

---

## Phase 3 — Data-driven evolution

Open-ended and conditional.

**The hard rule (principle #3)**: before proposing any intervention, answer the question — _"show me the metric that proves this is the bottleneck"_. The answer must be a specific Prometheus series and benchmark percentile, committed to `docs/benchmarks/`. Only then: **change → benchmark → compare.** A hypothesis without a metric pointer is not a Phase 3 candidate — it is an intuition, and intuitions are not shipped.

Each intervention = one feature branch + one "before" benchmark row + one "after" benchmark row + one `docs/benchmarks/INDEX.md` entry. A documented "no effect" result is a valid and valuable outcome.

### Candidate catalog

| Candidate                       | Motivating signal                                                                    | Rough approach                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| JSON → Protobuf broadcast       | `broadcast_send_duration_ms` dominates, or CPU profile shows `stringify`/`parse` hot | Proto schema in `packages/shared`; WS subprotocol negotiation; dual-encode benchmark |
| Broadcast batching / coalescing | High `broadcast_fanout_size` p99 + send time proportional to fanout                  | Coalesce per-drone updates in 50–100 ms window; send array payload                   |
| WS ingest backpressure          | Event-loop lag spikes on ingest surge without DB pressure                            | Use `ws.bufferedAmount` + per-connection rate limit; reject-fast over silent drop    |
| DB pool / batch-size tuning     | `queue_wait_ms` dominates; `persist_flush_duration_ms` linear in batch size          | Tune pool max, batch size; potentially parallel flush with ordering care             |
| Broadcast on worker thread      | Event-loop lag correlates with fanout size                                           | Move serialize + fanout to `worker_threads`; main thread stays responsive            |
| Subscription filtering          | Most clients care about bbox/subset of drones                                        | `/ws/stream` accepts filter params; server-side filter before fanout                 |

Out of scope for V2 (deferred to v5+): NATS/message bus, multi-process architecture, cross-node state sync.

### Exit criterion

2–4 interventions landed with measured before/after numbers, plus `docs/benchmarks/SUMMARY.md` — the portfolio writeup: where time was spent, what moved the needle, what didn't.

---

## Critical files

**To modify (Phase 1):**

- `apps/api/src/ingest/server.ts` — `session_id` + `msg_id` minting, stage timers
- `apps/api/src/state/manager.ts` — timer around `update()`
- `apps/api/src/persist/queue.ts` — `t_enqueue` stamping, `queue_wait_ms` on flush, expose dropped counter
- `apps/api/src/realtime/server.ts` — `server_send_ts` stamping, fanout histogram, send timer
- `apps/api/src/app.ts` — mount `/metrics` router with token gate
- `apps/api/src/logger.ts` — confirm pino-http excluded from `/metrics`
- `apps/api/src/config.ts` — add `METRICS_TOKEN` to zod schema
- `packages/shared/src/*` — broadcast payload gains `msg_id`, `server_recv_ts`, `server_send_ts`, `benchmark_id?`
- `docker-compose.yml` — add `prometheus` + `grafana` services

**To create (Phase 1):**

- `apps/api/src/metrics/` — `registry.ts`, `collectors.ts` (histogram/counter/gauge definitions), `middleware.ts` (token gate), `index.ts` (exports)
- `apps/api/prometheus/prometheus.yml`
- `apps/api/grafana/provisioning/datasources/prometheus.yml`
- `apps/api/grafana/provisioning/dashboards/dashboards.yml`
- `apps/api/grafana/dashboards/pipeline-overview.json`
- `apps/api/grafana/dashboards/system-health.json`
- `apps/api/grafana/alerts/*.json` (or managed inline in dashboards)

**To create (Phase 2):**

- `apps/benchmark/` — new pnpm workspace, CLI entry, producer, subscriber, aggregator
- `docs/benchmarks/INDEX.md`
- `docs/benchmarks/README.md` — how to run, how to interpret

**To create (Phase 3, final):**

- `docs/benchmarks/SUMMARY.md` — portfolio writeup

### Reuse / leverage

- `apps/emulator/src/client.ts` `DroneClient` — benchmark harness reuses connection + publish logic
- `apps/emulator/src/drone.ts` — benchmark harness reuses flight model for payload realism
- `apps/api/src/logger.ts` `pino` setup — extend with `child({ session_id })` pattern
- Existing `_droppedWrites` in `persist/queue.ts:23` — just needs metric wiring, logic is in place
- Existing `EventEmitter` in `state/manager.ts` — instrumentation hooks here without changing semantics
- `apps/api/src/config.ts` zod schema — extend with `METRICS_TOKEN`, nothing new structurally

---

## Verification

Per phase:

**Phase 1:**

- `pnpm typecheck`, `pnpm lint`, `pnpm test` — all green (behaviour unchanged, only additions)
- `docker-compose up -d` brings up postgres + prometheus + grafana
- `curl -H "Authorization: Bearer $METRICS_TOKEN" localhost:3000/metrics` returns prom format; unauth returns 401
- Prometheus UI at `localhost:9090` shows `up{job="api"}=1`, all expected metric names present
- Grafana UI at `localhost:3001` auto-loads both dashboards; panels render with data
- Run emulator `DRONE_COUNT=10 TICK_MS=1000` — all stage histograms populate; `msg_id` appears in logs at ingest, persist-flush, and broadcast
- Alerts visible in Grafana alerting UI in observe-only state

**Phase 2:**

- `pnpm bench --scenario baseline --tag v2.1-baseline` completes, produces artifact directory with `config.json` + `results.json` + `metrics-snapshot.txt` + `summary.md`
- `results.json` contains all six segments and all backpressure indicators
- `INDEX.md` updated
- Ramp and sustained scenarios complete; summary files capture the first hypothesis

**Phase 3 (per intervention):**

- Before-run benchmark committed
- Intervention on feature branch; unit + integration tests pass
- After-run benchmark shows measurable delta (or a documented "no effect" result)
- `SUMMARY.md` updated at V2 close

---

## Open items / deferrals

- **OTel / tracing** — not in V2. Revisit if stage histograms don't localize bottlenecks well enough.
- **Alertmanager** — not in V2. Revisit if routing/silencing becomes necessary.
- **Traceparent ID format** — defer until OTel. Current UUIDv7 is fine.
- **Spike / soak / high-frequency scenarios** — defer until findings motivate.
- **Production-grade auth on `/metrics`** — bearer token is sufficient for portfolio scope.
- **Web dashboard e2e latency display** — allowed as indicative metric only; authoritative numbers come from the harness.

---

## Next action after ExitPlanMode

1. Copy this plan to `docs/superpowers/specs/2026-04-18-v2-observability-design.md` and commit.
2. Invoke `superpowers:writing-plans` skill to produce the executable implementation plan from this design.
3. Begin Phase 1 implementation, TDD-first per project conventions.
