# Benchmark Summary — ramp / v2.1-ramp

## Run info

- Scenario: ramp
- Tag: v2.1-ramp
- Drones: 500 @ 1 Hz for 60s
- Samples collected: 30000

## Key numbers

| Segment               | p50   | p95    | p99    |
| --------------------- | ----- | ------ | ------ |
| e2e (ms)              | 1     | 6      | 14     |
| server recv→send (ms) | 0     | 0      | 1      |
| send→client recv (ms) | 0     | 1      | 1      |
| queue wait (ms)       | 22.71 | 259.19 | 451.84 |
| persist flush (ms)    | 17.46 | 38.52  | 75.3   |

## Observations

<!-- Fill in after reviewing results -->

## Proposed next action

<!-- What does the data suggest we investigate next? -->
