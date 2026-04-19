# Benchmark Summary — sustained / v2.1-sustained

## Run info

- Scenario: sustained
- Tag: v2.1-sustained
- Drones: 1000 @ 1 Hz for 300s
- Samples collected: 300000

## Key numbers

| Segment               | p50   | p95    | p99    |
| --------------------- | ----- | ------ | ------ |
| e2e (ms)              | 5     | 23     | 30     |
| server recv→send (ms) | 0     | 0      | 0      |
| send→client recv (ms) | 0     | 1      | 2      |
| queue wait (ms)       | 23.46 | 121.45 | 401.51 |
| persist flush (ms)    | 18.23 | 49.18  | 90.33  |

## Observations

1. **Broadcast path is free**: `server_recv_to_send` p95 = 0ms throughout. The in-memory fan-out loop is not the bottleneck at 1000 drones @ 1Hz.

2. **e2e p95 = 23ms** at steady state — well within the 250ms alert threshold. System is healthy from a real-time delivery standpoint.

3. **queue_wait dominates tail latency**: p99 = 401ms. This is where e2e tail comes from. However `queue_growth_rate_per_s = 0` confirms the persist queue is draining — it is not growing unboundedly. The wait comes from the batch timer, not queue saturation.

4. **Event loop lag crept from 11ms (baseline) to 29ms (300s sustained)**. This is the most interesting signal for Phase 3. The growth correlates with sustained 1000-drone load, suggesting the main event loop work scales with drone count. The likely cause is broadcasting a full 1000-drone state snapshot every tick — each broadcast serializes all ~1000 records even though only a fraction changed.

5. **0 drops, 0 errors** — the system is stable and correct at this load.

6. **Known counter bugs**: `persist_rows` counts flush events (not rows) and `broadcast_sent` counts connection events (not messages). The `ingest_persist_lag_msgs` figure (394k) is derived from these and is therefore unreliable. Do not use for Phase 3 decisions.

## Proposed next action

**Candidate: broadcast payload optimization (delta or per-drone messages)**

Motivating metric: `event_loop_lag_p99_s` grows from 0.011s at 10 drones to 0.029s at 1000 drones sustained. The broadcast path serializes all N drone states per tick even though a real subscriber only needs the delta. Confirm with a Prometheus scrape comparing `broadcast_send_duration_ms` at 10 vs 1000 drones.

If confirmed: test sending per-drone update messages rather than full-state snapshots. Expected effect: linear reduction in serialization work per tick, event loop lag returns toward baseline.

Secondary candidate if broadcast is not the cause: increase `persist_flush` batch size and/or parallelism — `queue_wait p99 = 401ms` motivates this. Metric: `queue_wait_ms` histogram buckets.
