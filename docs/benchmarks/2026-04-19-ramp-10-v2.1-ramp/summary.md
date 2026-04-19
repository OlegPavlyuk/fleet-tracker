# Benchmark Summary — ramp / v2.1-ramp

## Run info

- Scenario: ramp
- Tag: v2.1-ramp
- Drones: 10 @ 1 Hz for 60s
- Samples collected: 600

## Key numbers

| Segment               | p50   | p95   | p99   |
| --------------------- | ----- | ----- | ----- |
| e2e (ms)              | 1     | 3     | 4     |
| server recv→send (ms) | 0     | 1     | 1     |
| send→client recv (ms) | 0     | 1     | 1     |
| queue wait (ms)       | 375   | 487.5 | 497.5 |
| persist flush (ms)    | 17.69 | 70    | 94    |

## Observations

<!-- Fill in after reviewing results -->

## Proposed next action

<!-- What does the data suggest we investigate next? -->
