import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { attachRealtimeWs } from '../server.js';
import type { RealtimeDeps } from '../server.js';
import { StateManager } from '../../state/manager.js';
import type { ServerMessage, TelemetryMessage } from '@fleet-tracker/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.once('close', (code, reasonBuf) => resolve({ code, reason: reasonBuf.toString() }));
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

/**
 * Attach a buffering message collector to a WebSocket immediately on creation.
 * This avoids a race where the server sends a message in the same TCP burst as
 * the HTTP 101 upgrade response — causing 'message' to fire before any
 * listener registered after 'await waitForOpen(ws)' is installed.
 */
function makeMessageCollector(ws: WebSocket): () => Promise<ServerMessage> {
  const queue: ServerMessage[] = [];
  const resolvers: Array<(msg: ServerMessage) => void> = [];

  ws.on('message', (data) => {
    const text = Buffer.isBuffer(data)
      ? data.toString('utf8')
      : Buffer.from(data as ArrayBuffer).toString('utf8');
    const msg = JSON.parse(text) as ServerMessage;
    const resolver = resolvers.shift();
    if (resolver) {
      resolver(msg);
    } else {
      queue.push(msg);
    }
  });

  return function nextMessage(): Promise<ServerMessage> {
    const queued = queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => resolvers.push(resolve));
  };
}

const TELEMETRY: TelemetryMessage = {
  droneId: 'drone-1',
  ts: 1700000000000,
  lat: 50.4501,
  lng: 30.5234,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('attachRealtimeWs', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let stateManager: StateManager;
  let verifyJwt: RealtimeDeps['verifyJwt'];
  let port: number;

  beforeEach(async () => {
    stateManager = new StateManager();
    verifyJwt = vi.fn().mockResolvedValue({ sub: 'user-1', email: 'test@test.com' });
    server = http.createServer();
    wss = attachRealtimeWs(server, { verifyJwt, stateManager });
    await new Promise<void>((res) => server.listen(0, res));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    wss.clients.forEach((c) => c.terminate());
    await new Promise<void>((res) => wss.close(() => res()));
    await new Promise<void>((res) => server.close(() => res()));
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it('closes with 4401 when token query param is absent', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/stream`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4401);
  });

  it('closes with 4401 when JWT verification fails', async () => {
    vi.mocked(verifyJwt).mockRejectedValueOnce(new Error('Invalid JWT'));
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/stream?token=bad-jwt`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4401);
  });

  // ── Initial state dump ──────────────────────────────────────────────────────

  it('sends empty snapshot on connect when no drones are tracked', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/stream?token=valid-jwt`);
    const nextMessage = makeMessageCollector(ws);
    await waitForOpen(ws);
    const msg = await nextMessage();
    expect(msg).toEqual({ type: 'snapshot', payload: [] });
    ws.close();
  });

  it('sends snapshot with all current drone states on connect', async () => {
    stateManager.update('drone-1', TELEMETRY);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/stream?token=valid-jwt`);
    const nextMessage = makeMessageCollector(ws);
    await waitForOpen(ws);
    const msg = await nextMessage();

    expect(msg.type).toBe('snapshot');
    if (msg.type === 'snapshot') {
      expect(msg.payload).toHaveLength(1);
      expect(msg.payload[0]).toMatchObject({ droneId: 'drone-1', lat: 50.4501 });
    }
    ws.close();
  });

  // ── Realtime updates ────────────────────────────────────────────────────────

  it('broadcasts update message to client when stateManager emits state-changed', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/stream?token=valid-jwt`);
    const nextMessage = makeMessageCollector(ws);
    await waitForOpen(ws);
    await nextMessage(); // consume initial snapshot

    stateManager.update('drone-1', TELEMETRY);
    const msg = await nextMessage();

    expect(msg.type).toBe('update');
    if (msg.type === 'update') {
      expect(msg.payload.droneId).toBe('drone-1');
      expect(msg.payload.lat).toBe(50.4501);
    }
    ws.close();
  });

  it('broadcasts updates to all connected clients', async () => {
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws/stream?token=valid-jwt`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/stream?token=valid-jwt`);
    const nextMsg1 = makeMessageCollector(ws1);
    const nextMsg2 = makeMessageCollector(ws2);
    await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);
    await Promise.all([nextMsg1(), nextMsg2()]); // consume snapshots

    stateManager.update('drone-1', TELEMETRY);
    const [msg1, msg2] = await Promise.all([nextMsg1(), nextMsg2()]);

    expect(msg1.type).toBe('update');
    expect(msg2.type).toBe('update');
    ws1.close();
    ws2.close();
  });

  it('removes state-changed listener after client disconnects', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/stream?token=valid-jwt`);
    const nextMessage = makeMessageCollector(ws);
    await waitForOpen(ws);
    await nextMessage(); // consume snapshot

    const listenersBefore = stateManager.listenerCount('state-changed');
    ws.close();
    await waitForClose(ws);

    await vi.waitFor(() => {
      expect(stateManager.listenerCount('state-changed')).toBe(listenersBefore - 1);
    });
  });
});
