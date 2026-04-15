import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistQueue } from './queue.js';
import type { PersistDeps } from './queue.js';
import type { TelemetryMessage } from '@fleet-tracker/shared';

const baseEntry: TelemetryMessage = {
  droneId: 'drone-1',
  ts: 1_000_000,
  lat: 50.45,
  lng: 30.52,
  altitude_m: 120,
  heading_deg: 90,
  speed_mps: 10,
  battery_pct: 80,
};

function makeDeps(onInsert?: (rows: TelemetryMessage[]) => void): PersistDeps {
  return {
    batchInsert: (rows) => {
      onInsert?.(rows);
      return Promise.resolve();
    },
  };
}

describe('PersistQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with droppedWrites at 0', () => {
    const queue = new PersistQueue(makeDeps());
    expect(queue.droppedWrites).toBe(0);
    void queue.stop();
  });

  it('flushes buffered entries after the interval fires', async () => {
    const batches: TelemetryMessage[][] = [];
    const queue = new PersistQueue(makeDeps((rows) => batches.push(rows)));

    queue.push(baseEntry);
    queue.push({ ...baseEntry, droneId: 'drone-2' });

    expect(batches).toHaveLength(0); // not flushed yet

    await vi.advanceTimersByTimeAsync(500);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);

    await queue.stop();
  });

  it('does not call batchInsert when buffer is empty at interval', async () => {
    const batches: TelemetryMessage[][] = [];
    const queue = new PersistQueue(makeDeps((rows) => batches.push(rows)));

    await vi.advanceTimersByTimeAsync(500);

    expect(batches).toHaveLength(0);

    await queue.stop();
  });

  it('flushes immediately when flushSize threshold is reached', async () => {
    const batches: TelemetryMessage[][] = [];
    const queue = new PersistQueue(
      makeDeps((rows) => batches.push(rows)),
      {
        flushSize: 3,
      },
    );

    queue.push(baseEntry);
    queue.push(baseEntry);

    expect(batches).toHaveLength(0); // threshold not reached

    queue.push(baseEntry); // 3rd push → flush triggered

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);

    await queue.stop();
  });

  it('evicts oldest entry when ring-buffer is full', async () => {
    // Hang batchInsert so isFlushing stays true and no flush drains the buffer.
    let resolveFirst!: () => void;
    let insertCallCount = 0;
    const deps: PersistDeps = {
      batchInsert: () => {
        insertCallCount++;
        // Only the first call hangs; subsequent calls (e.g. from stop()) resolve immediately.
        if (insertCallCount === 1) {
          return new Promise((res) => {
            resolveFirst = res;
          });
        }
        return Promise.resolve();
      },
    };

    // flushSize=3 triggers first flush quickly; maxBuffer=5 to test overflow cheaply.
    const queue = new PersistQueue(deps, { maxBuffer: 5, flushSize: 3 });

    // Push 3 items → size trigger fires flush #1 (hangs), buffer drained to 0.
    queue.push({ ...baseEntry, droneId: 'd-1' });
    queue.push({ ...baseEntry, droneId: 'd-2' });
    queue.push({ ...baseEntry, droneId: 'd-3' });

    // isFlushing is now true. Push 6 more → fills 5-slot buffer then overflows once.
    queue.push({ ...baseEntry, droneId: 'd-4' }); // slot 1
    queue.push({ ...baseEntry, droneId: 'd-5' }); // slot 2
    queue.push({ ...baseEntry, droneId: 'd-6' }); // slot 3 → size trigger → skipped (isFlushing)
    queue.push({ ...baseEntry, droneId: 'd-7' }); // slot 4
    queue.push({ ...baseEntry, droneId: 'd-8' }); // slot 5 → full
    queue.push({ ...baseEntry, droneId: 'd-9' }); // overflows → evicts d-4, droppedWrites++

    expect(queue.droppedWrites).toBe(1);

    // Resolve the hanging flush and let its finally block run.
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(insertCallCount).toBe(1); // only one batchInsert call so far

    await queue.stop(); // drains remaining 5 items via a second batchInsert call
  });

  it('does not start a second flush while one is already in progress', async () => {
    let resolveFirst!: () => void;
    let insertCallCount = 0;
    const deps: PersistDeps = {
      batchInsert: () => {
        insertCallCount++;
        return new Promise((res) => {
          resolveFirst = res;
        });
      },
    };

    const queue = new PersistQueue(deps, { flushSize: 3 });

    // First batch → size trigger → flush #1 starts and hangs.
    queue.push(baseEntry);
    queue.push(baseEntry);
    queue.push(baseEntry);

    // Second batch → size trigger → flush() returns early (isFlushing guard).
    queue.push(baseEntry);
    queue.push(baseEntry);
    queue.push(baseEntry);

    expect(insertCallCount).toBe(1);

    resolveFirst();
    await queue.stop();
  });

  it('increments droppedWrites by batch size when batchInsert throws', async () => {
    const deps: PersistDeps = {
      batchInsert: () => Promise.reject(new Error('DB connection lost')),
    };
    const queue = new PersistQueue(deps, { flushSize: 2 });

    queue.push(baseEntry);
    queue.push(baseEntry); // size trigger → flush → throws

    // Flush is async; wait for it to settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.droppedWrites).toBe(2);

    await queue.stop();
  });

  it('drains remaining entries when stop() is called before interval fires', async () => {
    const batches: TelemetryMessage[][] = [];
    const queue = new PersistQueue(
      makeDeps((rows) => batches.push(rows)),
      {
        flushIntervalMs: 10_000, // long interval — won't fire in this test
        flushSize: 100,
      },
    );

    queue.push(baseEntry);
    queue.push(baseEntry);

    expect(batches).toHaveLength(0);

    await queue.stop();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });
});
