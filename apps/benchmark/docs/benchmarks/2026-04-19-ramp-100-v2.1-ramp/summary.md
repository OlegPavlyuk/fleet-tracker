# Benchmark Summary — ramp / v2.1-ramp

## Run info

- Scenario: ramp
- Tag: v2.1-ramp
- Drones: 100 @ 1 Hz for 60s
- Samples collected: 6000

## Key numbers

| Segment               | p50   | p95 | p99 |
| --------------------- | ----- | --- | --- |
| e2e (ms)              | 1     | 4   | 9   |
| server recv→send (ms) | 0     | 0   | 1   |
| send→client recv (ms) | 0     | 1   | 3   |
| queue wait (ms)       | 15.99 | 425 | 485 |
| persist flush (ms)    | 18.47 | 55  | 91  |

## Observations

<!-- Fill in after reviewing results -->

## Proposed next action

<!-- What does the data suggest we investigate next? -->
