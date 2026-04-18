import WebSocket from 'ws';
import { stateToTelemetry, tick, type BBox, type DroneState } from './drone.js';

export interface DroneClientOptions {
  /** WebSocket URL of the ingest endpoint, e.g. ws://localhost:3000/ws/ingest */
  ingestUrl: string;
  /** Plain-text device token for this drone */
  deviceToken: string;
  /** Initial drone state */
  initialState: DroneState;
  /** Bounding box used to bounce the drone */
  bbox: BBox;
  /** Tick interval in milliseconds (default 1000) */
  tickMs?: number;
}

export class DroneClient {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: DroneState;
  private readonly opts: Required<DroneClientOptions>;
  private stopped = false;

  constructor(opts: DroneClientOptions) {
    this.opts = { tickMs: 1000, ...opts };
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
    if (this.ws !== null) {
      this.ws.close(1000, 'Emulator stopped');
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.stopped) return;

    const url = new URL(this.opts.ingestUrl);
    url.searchParams.set('token', this.opts.deviceToken);

    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.on('open', () => {
      // Send first frame immediately, then on each tick
      this.sendTelemetry();
      this.timer = setInterval(() => {
        this.advanceAndSend();
      }, this.opts.tickMs);
    });

    ws.on('close', (code, reason) => {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      if (!this.stopped) {
        const reasonStr = reason.toString();
        console.error(
          `[${this.state.droneId}] WS closed (${code} ${reasonStr}), reconnecting in 3s…`,
        );
        setTimeout(() => this.connect(), 3000);
      }
    });

    ws.on('error', (err) => {
      console.error(`[${this.state.droneId}] WS error: ${err.message}`);
      // 'close' will fire after 'error', so reconnect is handled there
    });
  }

  private advanceAndSend(): void {
    this.state = tick(this.state, this.opts.bbox, this.opts.tickMs);
    this.sendTelemetry();
  }

  private sendTelemetry(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg = stateToTelemetry(this.state);
      this.ws.send(JSON.stringify(msg));
    }
  }
}
