// apps/api/src/__tests__/integration/pipeline.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { startContainer, stopContainer, startTestServer } from './helpers/test-server.js';
import type { TestDb, TestServerHandle } from './helpers/test-server.js';
import { collectMessages } from './helpers/collect-messages.js';
import type { ServerMessage } from '@fleet-tracker/shared';
import { telemetry } from '../../db/schema.js';

const N = 10;

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

function wsUrl(path: string): string {
  return handle.baseUrl.replace('http://', 'ws://') + path;
}

describe('Pipeline consistency — N messages in → N broadcasts + N DB rows', () => {
  it(`sends ${N} telemetry messages and verifies broadcasts and DB writes`, async () => {
    // 1. Register user + drone
    const email = `pipeline-${randomUUID()}@test.com`;
    const reg = await request(handle.baseUrl)
      .post('/auth/register')
      .send({ email, password: 'password123' });
    expect(reg.status).toBe(201);
    const { token } = reg.body as { token: string };

    const droneRes = await request(handle.baseUrl)
      .post('/drones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pipeline Drone', model: 'DJI' });
    expect(droneRes.status).toBe(201);
    const { id: droneId, deviceToken } = droneRes.body as { id: string; deviceToken: string };

    // 2. Connect stream client — drain snapshot
    const streamWs = new WebSocket(`${wsUrl('/ws/stream')}?token=${token}`);
    const snapshot = await collectMessages<ServerMessage>(streamWs, 1, 3000);
    expect(snapshot[0]?.type).toBe('snapshot');

    // 3. Start collecting N updates before sending
    const updatesPromise = collectMessages<ServerMessage>(streamWs, N, 5000);

    // 4. Connect ingest client and send N messages
    const ingestWs = new WebSocket(`${wsUrl('/ws/ingest')}?token=${deviceToken}`);
    await new Promise<void>((resolve, reject) => {
      ingestWs.on('open', resolve);
      ingestWs.on('error', reject);
    });

    const baseTs = Date.now();
    for (let i = 0; i < N; i++) {
      ingestWs.send(
        JSON.stringify({
          droneId,
          ts: baseTs + i,
          lat: 50.45 + i * 0.001,
          lng: 30.52 + i * 0.001,
          altitude_m: 100 + i,
          heading_deg: i * 36,
          speed_mps: 10,
          battery_pct: 90 - i,
        }),
      );
    }

    // 5. Assert N update broadcasts received
    const updates = await updatesPromise;
    ingestWs.close();
    streamWs.close();

    expect(updates).toHaveLength(N);
    expect(updates.every((m) => (m as { type: string }).type === 'update')).toBe(true);
    expect(
      updates.every(
        (m) => (m as { type: string; payload: { droneId: string } }).payload.droneId === droneId,
      ),
    ).toBe(true);

    // 6. Explicit flush — no timer wait
    await handle.persistQueue.flush();

    // 7. Assert N rows in telemetry table
    const rows = await testDb.db
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(eq(telemetry.droneId, droneId));
    expect(rows).toHaveLength(N);
  });
});
