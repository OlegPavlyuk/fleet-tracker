# Benchmark Summary — highfreq / v2.1-hf5

## Run info

- Scenario: highfreq
- Tag: v2.1-hf5
- Drones: 1000 @ 5 Hz for 120s
- Samples collected: 595170

## Key numbers

| Segment               | p50   | p95   | p99    |
| --------------------- | ----- | ----- | ------ |
| e2e (ms)              | 6     | 25    | 63     |
| server recv→send (ms) | 0     | 0     | 0      |
| send→client recv (ms) | 0     | 1     | 5      |
| queue wait (ms)       | 22.39 | 89.99 | 254.28 |
| persist flush (ms)    | 18.88 | 57.3  | 96.38  |

## Observations

1. **First drops appear at 5Hz**: 1,438 cumulative drops, ~12/s = 0.14% drop rate. The persist ring buffer is just starting to feel pressure at 5k msg/s.

2. **e2e p95 = 25ms** — comparable to 1Hz sustained (23ms). System is still mostly healthy.

3. **persist_flush p95 = 57ms** — up from 49ms at 1Hz sustained but not alarming yet.

4. **Event loop lag = 37ms** — up from 29ms at 1Hz sustained. Growing linearly with Hz.

5. **Broadcast still free** (0ms p95/p99). Fan-out is not the bottleneck at this load.

6. **send_to_client_recv p99 = 5ms** — mild but visible subscriber backpressure starting.

5Hz is the knee: system is degrading but functional. See v2.1-hf10 for where it breaks.

## Proposed next action

Run 10Hz to confirm where the system breaks — see v2.1-hf10 summary.
