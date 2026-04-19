# Benchmark Summary — baseline / v2.1-baseline

## Run info

- Scenario: baseline
- Tag: v2.1-baseline
- Drones: 10 @ 1 Hz for 60s
- Samples collected: 600

## Key numbers

| Segment               | p50  | p95   | p99   |
| --------------------- | ---- | ----- | ----- |
| e2e (ms)              | 1    | 4     | 7     |
| server recv→send (ms) | 0    | 1     | 1     |
| send→client recv (ms) | 0    | 1     | 2     |
| queue wait (ms)       | 375  | 487.5 | 497.5 |
| persist flush (ms)    | 18.8 | 78.57 | 95.71 |

## Observations

<!-- Fill in after reviewing results -->

## Proposed next action

<!-- What does the data suggest we investigate next? -->
