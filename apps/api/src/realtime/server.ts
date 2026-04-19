// Import from 'http' (not 'node:http') so pino-http module augmentation on IncomingMessage applies
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { BroadcastSnapshot, ServerMessage, StateSnapshot } from '@fleet-tracker/shared';
import type { TokenPayload } from '../auth/jwt.js';
import { v7 as uuidv7 } from 'uuid';
import { logger } from '../logger.js';
import {
  wsStreamConnections,
  wsConnectionsTotal,
  broadcastSendDurationMs,
  broadcastFanoutSize,
  broadcastSendFailuresTotal,
  serverIngressToBroadcastMs,
} from '../metrics/index.js';

export interface RealtimeDeps {
  verifyJwt: (token: string) => Promise<TokenPayload>;
  stateManager: {
    getAll(): StateSnapshot[];
    on(event: 'state-changed', listener: (snapshot: StateSnapshot) => void): unknown;
    off(event: 'state-changed', listener: (snapshot: StateSnapshot) => void): unknown;
  };
}

export function attachRealtimeWs(server: http.Server, deps: RealtimeDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Fires once per state-change event (not once per connected client),
  // so we get exactly one observation of the actual fanout size per broadcast.
  function recordFanout(): void {
    broadcastFanoutSize.observe(wss.clients.size);
  }
  deps.stateManager.on('state-changed', recordFanout);

  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname === '/ws/stream') {
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit('connection', client, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const sessionId = uuidv7();
    const sessionLogger = logger.child({ session_id: sessionId, endpoint: 'stream' });

    wsStreamConnections.inc();
    wsConnectionsTotal.inc({ endpoint: 'stream', event: 'connect' });

    void (async () => {
      // ── 1. Auth: JWT from query param ─────────────────────────────────────────
      const url = new URL(req.url ?? '', 'ws://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4401, 'Missing JWT');
        wsStreamConnections.dec();
        wsConnectionsTotal.inc({ endpoint: 'stream', event: 'disconnect' });
        return;
      }

      let payload: TokenPayload;
      try {
        payload = await deps.verifyJwt(token);
      } catch {
        ws.close(4401, 'Invalid JWT');
        wsStreamConnections.dec();
        wsConnectionsTotal.inc({ endpoint: 'stream', event: 'disconnect' });
        return;
      }

      sessionLogger.debug({ userId: payload.sub }, 'Realtime client connected');

      // ── 2. Send initial state dump ────────────────────────────────────────────
      const initMsg: ServerMessage = { type: 'snapshot', payload: deps.stateManager.getAll() };
      ws.send(JSON.stringify(initMsg));

      // ── 3. Subscribe to realtime state updates ────────────────────────────────
      function onStateChanged(snapshot: StateSnapshot): void {
        if (ws.readyState !== WebSocket.OPEN) return;

        const serverSendTs = Date.now();
        const broadcastSnap: BroadcastSnapshot = { ...snapshot, server_send_ts: serverSendTs };
        const msg: ServerMessage = { type: 'update', payload: broadcastSnap };

        const t0 = performance.now();
        try {
          ws.send(JSON.stringify(msg));
        } catch (err) {
          broadcastSendFailuresTotal.inc();
          sessionLogger.warn({ err, msg_id: snapshot.msg_id }, 'broadcast send failed');
        }
        broadcastSendDurationMs.observe(performance.now() - t0);

        if (snapshot.server_recv_ts !== undefined) {
          serverIngressToBroadcastMs.observe(serverSendTs - snapshot.server_recv_ts);
        }
      }

      deps.stateManager.on('state-changed', onStateChanged);

      ws.on('close', () => {
        deps.stateManager.off('state-changed', onStateChanged);
        wsStreamConnections.dec();
        wsConnectionsTotal.inc({ endpoint: 'stream', event: 'disconnect' });
        sessionLogger.debug({ userId: payload.sub }, 'Realtime client disconnected');
      });
    })();
  });

  wss.on('close', () => {
    deps.stateManager.off('state-changed', recordFanout);
  });

  return wss;
}
