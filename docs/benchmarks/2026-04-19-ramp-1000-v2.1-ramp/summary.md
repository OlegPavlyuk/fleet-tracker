# Benchmark Summary — ramp / v2.1-ramp

## Run info

- Scenario: ramp
- Tag: v2.1-ramp
- Drones: 1000 @ 1 Hz for 60s
- Samples collected: 60000

## Key numbers

| Segment               | p50   | p95    | p99    |
| --------------------- | ----- | ------ | ------ |
| e2e (ms)              | 1     | 9      | 109    |
| server recv→send (ms) | 0     | 0      | 1      |
| send→client recv (ms) | 0     | 1      | 2      |
| queue wait (ms)       | 20.44 | 192.65 | 448.77 |
| persist flush (ms)    | 17.25 | 26.55  | 60.71  |

## Observations

1. **Knee found between 500 and 1000 drones**: e2e p99 jumps from 14ms (500d) to 109ms (1000d) in the first 60s. p95 is still clean (9ms). This is the system settling under a step-load increase.

2. **queue_wait p95 decreases as load increases** (487ms@10d → 193ms@1000d) — counterintuitive but expected: at higher throughput the persist batch fills before the 1s timer fires, so average wait is shorter. The p99 tail stays elevated (448ms) because occasional large batches take longer.

3. **Event loop lag rises slightly at 1000d**: 15ms vs 11-12ms at lower loads. Not yet alarming but trending up.

4. The 60s window at 1000d is too short to see sustained behaviour — see `v2.1-sustained` for steady-state picture.
