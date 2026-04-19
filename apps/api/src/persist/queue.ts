import type { TelemetryMessage } from '@fleet-tracker/shared';
import { logger } from '../logger.js';
import {
  persistEnqueueDurationMs,
  persistQueueSize,
  persistFlushDurationMs,
  persistBatchSize,
  persistFlushTotal,
  queueWaitMs,
  persistDroppedTotal,
} from '../metrics/index.js';

export interface PersistDeps {
  batchInsert: (rows: TelemetryMessage[]) => Promise<void>;
}

interface QueueEntry {
  data: TelemetryMessage;
  tEnqueue: number;
  msgId: string;
}

interface PersistQueueOptions {
  maxBuffer?: number;
  flushSize?: number;
  flushIntervalMs?: number;
}

const DEFAULTS = {
  maxBuffer: 1000,
  flushSize: 100,
  flushIntervalMs: 500,
};

export class PersistQueue {
  private readonly entries: QueueEntry[] = [];
  private isFlushing = false;
  private _droppedWrites = 0;
  private readonly timer: NodeJS.Timeout;
  private readonly maxBuffer: number;
  private readonly flushSize: number;
  private readonly deps: PersistDeps;

  constructor(deps: PersistDeps, options?: PersistQueueOptions) {
    this.deps = deps;
    this.maxBuffer = options?.maxBuffer ?? DEFAULTS.maxBuffer;
    this.flushSize = options?.flushSize ?? DEFAULTS.flushSize;
    const flushIntervalMs = options?.flushIntervalMs ?? DEFAULTS.flushIntervalMs;
    this.timer = setInterval(() => void this.flush(), flushIntervalMs);
  }

  push(data: TelemetryMessage, msgId = ''): void {
    const t0 = performance.now();

    if (this.entries.length >= this.maxBuffer) {
      this.entries.shift(); // evict oldest — newest data takes priority
      this._droppedWrites++;
      persistDroppedTotal.inc();
    }

    this.entries.push({ data, tEnqueue: performance.now(), msgId });
    persistQueueSize.set(this.entries.length);
    persistEnqueueDurationMs.observe(performance.now() - t0);

    if (this.entries.length >= this.flushSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.entries.length === 0) return;
    this.isFlushing = true;

    const batch = this.entries.splice(0); // atomic drain (JS single-threaded)
    persistQueueSize.set(0);

    const tFlushStart = performance.now();

    for (const entry of batch) {
      queueWaitMs.observe(tFlushStart - entry.tEnqueue);
    }

    persistBatchSize.observe(batch.length);

    try {
      await this.deps.batchInsert(batch.map((e) => e.data));
      persistFlushTotal.inc({ result: 'ok' });
      logger.debug({ count: batch.length }, 'persist flush ok');
    } catch (err) {
      const count = batch.length;
      logger.error({ err, count }, 'persist flush failed — batch dropped');
      this._droppedWrites += count;
      persistDroppedTotal.inc(count);
      persistFlushTotal.inc({ result: 'error' });
    } finally {
      persistFlushDurationMs.observe(performance.now() - tFlushStart);
      this.isFlushing = false;
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }

  get droppedWrites(): number {
    return this._droppedWrites;
  }
}
