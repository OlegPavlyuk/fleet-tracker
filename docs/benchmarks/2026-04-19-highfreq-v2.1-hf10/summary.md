# Benchmark Summary — highfreq / v2.1-hf10

## Run info

- Scenario: highfreq
- Tag: v2.1-hf10
- Drones: 1000 @ 10 Hz for 120s
- Samples collected: 1155785

## Key numbers

| Segment               | p50   | p95    | p99    |
| --------------------- | ----- | ------ | ------ |
| e2e (ms)              | 30    | 103    | 161    |
| server recv→send (ms) | 0     | 0      | 1      |
| send→client recv (ms) | 0     | 3      | 16     |
| queue wait (ms)       | 30.66 | 92.66  | 187.75 |
| persist flush (ms)    | 20.23 | 187.69 | 249.5  |

## Observations

1. **System falls over at 10Hz (10k msg/s)**: 479,618 cumulative drops, ~478k in this run alone = ~41% drop rate. The persist ring buffer is evicting under load.

2. **persist_flush is the proven bottleneck**: p95 jumped from 57ms (5Hz) to 188ms (10Hz) — a 3× increase. At 10k msg/s the persist queue accumulates faster than the DB can drain it, causing ring buffer eviction.

3. **Event loop lag hits 125ms p99** (vs 37ms at 5Hz, 11ms at 1Hz). With 10k inbound WS callbacks/s the main thread is saturated — message parsing + zod validation + state update + enqueue + broadcast, 10k times/s.

4. **Broadcast path still free**: `server_recv_to_send` p95 = 0ms, p99 = 1ms. The fan-out serialisation does not dominate even at 10Hz.

5. **send_to_client_recv p99 = 16ms, max = 106ms**: subscriber is showing real backpressure at this load — the single WS connection to `/ws/stream` is receiving 10k msg/s of broadcast updates.

6. **Real ceiling is ~5–7k msg/s** (between 5Hz and 10Hz at 1000 drones): 5Hz runs with 12 drops/s (0.14%), 10Hz drops 4k/s (41%).

## Proposed next action

**Phase 3 candidate — persist pipeline: smaller batches + parallel flush (or worker thread)**

Proven bottleneck metric: `persist_flush_duration_ms p95 = 188ms` at 10Hz.
Mechanism: batches grow to ~10k rows at 10Hz; a single flush blocks the event loop for ~190ms; during that time the ring buffer fills and evicts.

Two interventions to test in order:

1. **Reduce batch interval** (e.g. 200ms instead of 1s) — smaller batches, faster drain, less blocking per flush. Expected: drop rate falls, flush duration falls, event loop lag falls.
2. **Move persist flush to a worker thread** — if batch-size tuning alone isn't enough, offloading the DB I/O off the main event loop removes the 190ms blocking window entirely. Motivating signal: `event_loop_lag_p99_s = 0.125s` at 10Hz.
