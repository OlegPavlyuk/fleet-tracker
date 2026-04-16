// apps/api/src/__tests__/integration/ws-contract.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { startContainer, stopContainer, startTestServer } from './helpers/test-server.js';
import type { TestDb, TestServerHandle } from './helpers/test-server.js';
import { collectMessages } from './helpers/collect-messages.js';
import type { ServerMessage } from '@fleet-tracker/shared';

let testDb: TestDb;
let handle: TestServerHandle;

beforeAll(async () => {
  testDb = await startContainer();
  handle = await startTestServer(testDb.db);
}, 90_000);

afterAll(async () => {
  await handle.close();
  await stopContainer(testDb);
});

async function registerAndLogin(): Promise<{ token: string; userId: string }> {
  const email = `ws-${randomUUID()}@test.com`;
  const reg = await request(handle.baseUrl)
    .post('/auth/register')
    .send({ email, password: 'password123' });
  expect(reg.status).toBe(201);
  const { token } = reg.body as { token: string; user: { id: string } };
  const userId = (reg.body as { user: { id: string } }).user.id;
  return { token, userId };
}

async function createDrone(token: string): Promise<{ droneId: string; deviceToken: string }> {
  const res = await request(handle.baseUrl)
    .post('/drones')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'WS Test Drone', model: 'DJI' });
  expect(res.status).toBe(201);
  const body = res.body as { drone: { id: string }; deviceToken: string };
  return { droneId: body.drone.id, deviceToken: body.deviceToken };
}

function wsUrl(path: string): string {
  return handle.baseUrl.replace('http://', 'ws://') + path;
}

describe('WS contract — snapshot on connect', () => {
  it('stream client receives snapshot message on connect', async () => {
    const { token } = await registerAndLogin();

    const streamWs = new WebSocket(`${wsUrl('/ws/stream')}?token=${token}`);
    const messages = await collectMessages<ServerMessage>(streamWs, 1, 3000);
    streamWs.close();

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('snapshot');
    expect(Array.isArray((messages[0] as { type: string; payload: unknown }).payload)).toBe(true);
  });
});

describe('WS contract — broadcast after ingest', () => {
  it('stream client receives update after ingest sends telemetry', async () => {
    const { token } = await registerAndLogin();
    const { droneId, deviceToken } = await createDrone(token);

    // Connect stream client first — start collecting before ingest connects
    const streamWs = new WebSocket(`${wsUrl('/ws/stream')}?token=${token}`);

    // Drain the snapshot (1 message)
    const snapshotMsgs = await collectMessages<ServerMessage>(streamWs, 1, 3000);
    expect(snapshotMsgs[0]?.type).toBe('snapshot');

    // Start collecting the next message (the update) before sending telemetry
    const updatePromise = collectMessages<ServerMessage>(streamWs, 1, 5000);

    // Connect ingest and send one telemetry message
    const ingestWs = new WebSocket(`${wsUrl('/ws/ingest')}?token=${deviceToken}`);
    await new Promise<void>((resolve, reject) => {
      ingestWs.on('open', resolve);
      ingestWs.on('error', reject);
    });

    ingestWs.send(
      JSON.stringify({
        droneId,
        ts: Date.now(),
        lat: 50.45,
        lng: 30.52,
        altitude_m: 100,
        heading_deg: 45,
        speed_mps: 10,
        battery_pct: 75,
      }),
    );

    const updates = await updatePromise;
    ingestWs.close();
    streamWs.close();

    expect(updates).toHaveLength(1);
    const update = updates[0] as {
      type: string;
      payload: { droneId: string; battery_pct: number };
    };
    expect(update.type).toBe('update');
    expect(update.payload.droneId).toBe(droneId);
    expect(update.payload.battery_pct).toBe(75);
  });
});
