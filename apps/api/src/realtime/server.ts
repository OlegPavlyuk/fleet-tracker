// Import from 'http' (not 'node:http') so pino-http module augmentation on IncomingMessage applies
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ServerMessage, StateSnapshot } from '@fleet-tracker/shared';
import type { TokenPayload } from '../auth/jwt.js';
import { logger } from '../logger.js';

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

  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname === '/ws/stream') {
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit('connection', client, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    void (async () => {
      // ── 1. Auth: JWT from query param ─────────────────────────────────────────
      const url = new URL(req.url ?? '', 'ws://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4401, 'Missing JWT');
        return;
      }

      let payload: TokenPayload;
      try {
        payload = await deps.verifyJwt(token);
      } catch {
        ws.close(4401, 'Invalid JWT');
        return;
      }

      logger.debug({ userId: payload.sub }, 'Realtime client connected');

      // ── 2. Send initial state dump ────────────────────────────────────────────
      const initMsg: ServerMessage = { type: 'snapshot', payload: deps.stateManager.getAll() };
      ws.send(JSON.stringify(initMsg));

      // ── 3. Subscribe to realtime state updates ────────────────────────────────
      function onStateChanged(snapshot: StateSnapshot): void {
        if (ws.readyState !== WebSocket.OPEN) return;
        const msg: ServerMessage = { type: 'update', payload: snapshot };
        ws.send(JSON.stringify(msg));
      }

      deps.stateManager.on('state-changed', onStateChanged);

      ws.on('close', () => {
        deps.stateManager.off('state-changed', onStateChanged);
        logger.debug({ userId: payload.sub }, 'Realtime client disconnected');
      });
    })();
  });

  return wss;
}
