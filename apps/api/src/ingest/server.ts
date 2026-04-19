// Import from 'http' (not 'node:http') so pino-http module augmentation on IncomingMessage applies
import http from 'http';
import { createHash } from 'node:crypto';
import { WebSocketServer, type RawData } from 'ws';
import { v7 as uuidv7 } from 'uuid';
import { TelemetryMessageSchema, type TelemetryMessage } from '@fleet-tracker/shared';
import { logger } from '../logger.js';
import {
  wsIngestConnections,
  wsConnectionsTotal,
  validateDurationMs,
  ingestMessagesTotal,
} from '../metrics/index.js';

export interface TelemetryMeta {
  msgId: string;
  serverRecvTs: number;
  benchmarkId?: string;
}

export interface IngestDeps {
  findDroneByTokenHash: (tokenHash: string) => Promise<{ id: string } | null>;
  onTelemetry: (droneId: string, msg: TelemetryMessage, meta: TelemetryMeta) => void;
}

export function attachIngestWs(server: http.Server, deps: IngestDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname === '/ws/ingest') {
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit('connection', client, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const sessionId = uuidv7();
    const sessionLogger = logger.child({ session_id: sessionId, endpoint: 'ingest' });

    wsIngestConnections.inc();
    wsConnectionsTotal.inc({ endpoint: 'ingest', event: 'connect' });

    ws.on('close', () => {
      wsIngestConnections.dec();
      wsConnectionsTotal.inc({ endpoint: 'ingest', event: 'disconnect' });
    });

    // Buffer frames that arrive before async auth completes so they are not lost.
    const pending: RawData[] = [];
    ws.on('message', (raw) => pending.push(raw));

    void (async () => {
      // ── 1. Extract and verify device token ──────────────────────────────────
      const url = new URL(req.url ?? '', 'ws://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4401, 'Missing device token');
        return;
      }

      const hash = createHash('sha256').update(token).digest('hex');
      const drone = await deps.findDroneByTokenHash(hash);

      if (!drone) {
        ws.close(4401, 'Invalid device token');
        return;
      }

      const droneId = drone.id;
      sessionLogger.info({ droneId }, 'Ingest client authenticated');

      // ── 2. Handle incoming telemetry frames ──────────────────────────────────
      function handleMessage(raw: RawData): void {
        const serverRecvTs = Date.now();

        const text = Buffer.isBuffer(raw)
          ? raw.toString('utf8')
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString('utf8')
            : Buffer.from(raw).toString('utf8');

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          ws.close(1003, 'Invalid JSON');
          return;
        }

        const t0 = performance.now();
        const result = TelemetryMessageSchema.safeParse(parsed);
        validateDurationMs.observe(performance.now() - t0);

        if (!result.success) {
          ingestMessagesTotal.inc({ result: 'invalid' });
          ws.close(1003, 'Invalid message schema');
          return;
        }

        const msgId = uuidv7();
        const meta: TelemetryMeta = {
          msgId,
          serverRecvTs,
          ...(result.data.benchmark_id !== undefined && { benchmarkId: result.data.benchmark_id }),
        };

        ingestMessagesTotal.inc({ result: 'ok' });
        sessionLogger.debug({ msg_id: msgId, droneId }, 'Telemetry frame ingested');

        deps.onTelemetry(droneId, result.data, meta);
      }

      // Swap out the buffer listener and replay any frames that arrived during auth.
      ws.removeAllListeners('message');
      for (const raw of pending) handleMessage(raw);
      ws.on('message', handleMessage);
    })();
  });

  return wss;
}
