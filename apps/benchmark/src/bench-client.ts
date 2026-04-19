import WebSocket from 'ws';
import { v7 as uuidv7 } from 'uuid';
import { tick, stateToPayload, type BBox, type DroneState } from './drone.js';

export interface BenchmarkDroneClientOptions {
  ingestUrl: string;
  deviceToken: string;
  initialState: DroneState;
  bbox: BBox;
  tickMs: number;
  sentFrames: Map<string, number>;
}

export class BenchmarkDroneClient {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: DroneState;
  private stopped = false;
  private readonly opts: BenchmarkDroneClientOptions;

  constructor(opts: BenchmarkDroneClientOptions) {
    this.opts = opts;
    this.state = opts.initialState;
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.ws?.close(1000, 'Benchmark stopped');
    this.ws = null;
  }

  private connect(): void {
    if (this.stopped) return;
    const url = new URL(this.opts.ingestUrl);
    url.searchParams.set('token', this.opts.deviceToken);
    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.on('open', () => {
      this.sendFrame();
      this.timer = setInterval(() => {
        this.state = tick(this.state, this.opts.bbox, this.opts.tickMs);
        this.sendFrame();
      }, this.opts.tickMs);
    });

    ws.on('close', () => {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      if (!this.stopped) {
        setTimeout(() => this.connect(), 3000);
      }
    });

    ws.on('error', () => {
      // 'close' fires after 'error', reconnect handled there
    });
  }

  private sendFrame(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const benchmarkId = uuidv7();
    const tSend = Date.now();
    this.opts.sentFrames.set(benchmarkId, tSend);
    this.ws.send(JSON.stringify(stateToPayload(this.state, benchmarkId)));
  }
}
