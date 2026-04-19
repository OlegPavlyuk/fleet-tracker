import WebSocket from 'ws';
import type { ServerMessage } from '@fleet-tracker/shared';

export interface LatencySample {
  benchmarkId: string;
  tSend: number;
  tRecv: number;
  serverRecvTs: number;
  serverSendTs: number;
}

export class BenchmarkSubscriber {
  private ws: WebSocket | null = null;
  private readonly samples: LatencySample[] = [];

  constructor(
    private readonly streamUrl: string,
    private readonly jwt: string,
    private readonly sentFrames: Map<string, number>,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.streamUrl);
      url.searchParams.set('token', this.jwt);
      const ws = new WebSocket(url.toString());
      this.ws = ws;

      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));

      ws.on('message', (raw) => {
        const tRecv = Date.now();
        let msg: ServerMessage;
        try {
          const text = Buffer.isBuffer(raw)
            ? raw.toString('utf8')
            : Array.isArray(raw)
              ? Buffer.concat(raw).toString('utf8')
              : Buffer.from(raw).toString('utf8');
          msg = JSON.parse(text) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type !== 'update') return;

        const { benchmark_id, server_recv_ts, server_send_ts } = msg.payload;
        if (!benchmark_id || server_recv_ts === undefined || server_send_ts === undefined) return;

        const tSend = this.sentFrames.get(benchmark_id);
        if (tSend === undefined) return;

        this.sentFrames.delete(benchmark_id);
        this.samples.push({
          benchmarkId: benchmark_id,
          tSend,
          tRecv,
          serverRecvTs: server_recv_ts,
          serverSendTs: server_send_ts,
        });
      });
    });
  }

  disconnect(): void {
    this.ws?.close(1000, 'Benchmark done');
    this.ws = null;
  }

  getSamples(): LatencySample[] {
    return this.samples;
  }

  clearSamples(): void {
    this.samples.length = 0;
  }
}
