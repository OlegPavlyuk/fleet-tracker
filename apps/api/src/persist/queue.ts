import type { TelemetryMessage } from '@fleet-tracker/shared';
import { logger } from '../logger.js';

export interface PersistDeps {
  batchInsert: (rows: TelemetryMessage[]) => Promise<void>;
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
  private readonly entries: TelemetryMessage[] = [];
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

  push(entry: TelemetryMessage): void {
    if (this.entries.length >= this.maxBuffer) {
      this.entries.shift(); // evict oldest — newest data takes priority
      this._droppedWrites++;
    }
    this.entries.push(entry);
    if (this.entries.length >= this.flushSize) {
      void this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.isFlushing || this.entries.length === 0) return;
    this.isFlushing = true;
    const batch = this.entries.splice(0); // atomic drain (JS single-threaded)
    try {
      await this.deps.batchInsert(batch);
    } catch (err) {
      logger.error({ err, count: batch.length }, 'persist flush failed — batch dropped');
      this._droppedWrites += batch.length;
    } finally {
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
