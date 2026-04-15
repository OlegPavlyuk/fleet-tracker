// apps/api/src/__tests__/integration/telemetry-history.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { startContainer, stopContainer } from './helpers/test-server.js';
import type { TestDb } from './helpers/test-server.js';
import { createApp } from '../../app.js';
import { users, drones, telemetry } from '../../db/schema.js';
import { signToken } from '../../auth/jwt.js';
import { config } from '../../config.js';
import { hashPassword } from '../../auth/password.js';

// Kyiv bbox: [30.30, 50.35, 30.70, 50.55]
const INSIDE_KYIV = [
  { lat: 50.45, lng: 30.52 },
  { lat: 50.46, lng: 30.53 },
  { lat: 50.47, lng: 30.54 },
];
const OUTSIDE_KYIV = [
  { lat: 51.51, lng: -0.12 }, // London
  { lat: 48.85, lng: 2.35 }, // Paris
];

const BASE_TS = 1700000000000; // fixed reference timestamp
const IN_RANGE_FROM = BASE_TS - 1000;
const IN_RANGE_TO = BASE_TS + 10_000;
const OUT_OF_RANGE_FROM = BASE_TS + 20_000;
const OUT_OF_RANGE_TO = BASE_TS + 30_000;

let testDb: TestDb;
let app: ReturnType<typeof createApp>;
let userAToken: string;
let userBToken: string;
let droneId: string;

beforeAll(async () => {
  testDb = await startContainer();
  app = createApp(testDb.db);

  // Seed userA
  const userAId = randomUUID();
  await testDb.db.insert(users).values({
    id: userAId,
    email: 'usera@test.com',
    passwordHash: await hashPassword('password123'),
  });
  userAToken = await signToken({ sub: userAId, email: 'usera@test.com' }, config.jwtSecret, '1h');

  // Seed userB
  const userBId = randomUUID();
  await testDb.db.insert(users).values({
    id: userBId,
    email: 'userb@test.com',
    passwordHash: await hashPassword('password123'),
  });
  userBToken = await signToken({ sub: userBId, email: 'userb@test.com' }, config.jwtSecret, '1h');

  // Seed drone owned by userA
  droneId = randomUUID();
  await testDb.db.insert(drones).values({
    id: droneId,
    ownerId: userAId,
    name: 'Test Drone',
    model: 'DJI',
    status: 'active',
    deviceTokenHash: createHash('sha256').update('test-token').digest('hex'),
  });

  // Seed 3 points inside Kyiv + 2 outside Kyiv — all within BASE_TS range
  const points = [
    ...INSIDE_KYIV.map((p, i) => ({ ...p, ts: new Date(BASE_TS + i * 1000) })),
    ...OUTSIDE_KYIV.map((p, i) => ({ ...p, ts: new Date(BASE_TS + (i + 3) * 1000) })),
  ];
  await testDb.db.insert(telemetry).values(
    points.map((p) => ({
      droneId,
      ts: p.ts,
      position: sql`ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)`,
      altitudeM: 100,
      headingDeg: 45,
      speedMps: 10,
      batteryPct: 80,
    })),
  );
}, 90_000);

afterAll(async () => {
  await stopContainer(testDb);
});

describe('GET /telemetry/history — integration', () => {
  it('returns all 5 rows when time range covers all points', async () => {
    const res = await request(app)
      .get('/telemetry/history')
      .query({ drone_id: droneId, from: IN_RANGE_FROM, to: IN_RANGE_TO + 10_000 })
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect((res.body as { points: unknown[] }).points).toHaveLength(5);
  });

  it('returns 0 rows when time range excludes all points', async () => {
    const res = await request(app)
      .get('/telemetry/history')
      .query({ drone_id: droneId, from: OUT_OF_RANGE_FROM, to: OUT_OF_RANGE_TO })
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect((res.body as { points: unknown[] }).points).toHaveLength(0);
  });

  it('returns only 3 points inside Kyiv bbox', async () => {
    const res = await request(app)
      .get('/telemetry/history')
      .query({
        drone_id: droneId,
        from: IN_RANGE_FROM,
        to: IN_RANGE_TO + 10_000,
        bbox: '30.30,50.35,30.70,50.55',
      })
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect((res.body as { points: unknown[] }).points).toHaveLength(3);
  });

  it('returns 403 when userB requests droneA history', async () => {
    const res = await request(app)
      .get('/telemetry/history')
      .query({ drone_id: droneId, from: IN_RANGE_FROM, to: IN_RANGE_TO + 10_000 })
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown drone_id', async () => {
    const res = await request(app)
      .get('/telemetry/history')
      .query({ drone_id: randomUUID(), from: IN_RANGE_FROM, to: IN_RANGE_TO + 10_000 })
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(404);
  });
});
