import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { attachIngestWs } from '../server.js';
import type { IngestDeps } from '../server.js';
import type { TelemetryMessage } from '@fleet-tracker/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function tokenHash(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function makeDeps() {
  const store = new Map<string, { id: string }>();
  const deps: IngestDeps = {
    findDroneByTokenHash: vi.fn((hash: string) => Promise.resolve(store.get(hash) ?? null)),
    onTelemetry: vi.fn(),
  };
  const register = (token: string, droneId: string) => {
    store.set(tokenHash(token), { id: droneId });
  };
  return { deps, register };
}

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

const VALID_TELEMETRY: TelemetryMessage = {
  droneId: 'drone-test-1',
  ts: 1700000000000,
  lat: 50.4501,
  lng: 30.5234,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('attachIngestWs', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let deps: IngestDeps;
  let register: (token: string, droneId: string) => void;
  let port: number;

  beforeEach(async () => {
    const made = makeDeps();
    deps = made.deps;
    register = made.register;
    server = http.createServer();
    wss = attachIngestWs(server, deps);
    await new Promise<void>((res) => server.listen(0, res));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    wss.clients.forEach((c) => c.terminate());
    await new Promise<void>((res) => wss.close(() => res()));
    await new Promise<void>((res) => server.close(() => res()));
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it('closes with code 4401 when token query param is absent', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ingest`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4401);
  });

  it('closes with code 4401 when token does not match any drone', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ingest?token=unknown-token`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4401);
  });

  // ── Message validation ──────────────────────────────────────────────────────

  it('closes with code 1003 when message is not valid JSON', async () => {
    const token = 'device-token-abc';
    register(token, 'drone-1');

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ingest?token=${token}`);
    await waitForOpen(ws);
    ws.send('not json at all');
    const { code } = await waitForClose(ws);
    expect(code).toBe(1003);
  });

  it('closes with code 1003 when message fails TelemetryMessage schema', async () => {
    const token = 'device-token-abc';
    register(token, 'drone-1');

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ingest?token=${token}`);
    await waitForOpen(ws);
    // Missing required fields
    ws.send(JSON.stringify({ droneId: 'drone-1', ts: 123 }));
    const { code } = await waitForClose(ws);
    expect(code).toBe(1003);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('calls onTelemetry with droneId and validated message for a valid frame', async () => {
    const token = 'device-token-abc';
    register(token, 'drone-1');

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ingest?token=${token}`);
    await waitForOpen(ws);
    ws.send(JSON.stringify(VALID_TELEMETRY));

    await vi.waitFor(() => {
      expect(deps.onTelemetry).toHaveBeenCalledWith(
        'drone-1',
        VALID_TELEMETRY,
        expect.objectContaining({
          msgId: expect.any(String) as unknown,
          serverRecvTs: expect.any(Number) as unknown,
        }),
      );
    });

    ws.close();
  });

  it('stays connected and keeps processing messages after a valid frame', async () => {
    const token = 'device-token-abc';
    register(token, 'drone-1');

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ingest?token=${token}`);
    await waitForOpen(ws);

    ws.send(JSON.stringify(VALID_TELEMETRY));
    ws.send(JSON.stringify({ ...VALID_TELEMETRY, battery_pct: 50 }));

    await vi.waitFor(() => {
      expect(deps.onTelemetry).toHaveBeenCalledTimes(2);
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});
