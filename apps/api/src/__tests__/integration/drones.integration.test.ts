// apps/api/src/__tests__/integration/drones.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startContainer, stopContainer } from './helpers/test-server.js';
import type { TestDb } from './helpers/test-server.js';
import { createApp } from '../../app.js';
import { users, drones } from '../../db/schema.js';
import { signToken } from '../../auth/jwt.js';
import { config } from '../../config.js';
import { hashPassword } from '../../auth/password.js';

let testDb: TestDb;
let app: ReturnType<typeof createApp>;
let userToken: string;
let userId: string;

beforeAll(async () => {
  testDb = await startContainer();
  app = createApp(testDb.db);

  userId = randomUUID();
  await testDb.db.insert(users).values({
    id: userId,
    email: 'owner@test.com',
    passwordHash: await hashPassword('password123'),
  });
  userToken = await signToken({ sub: userId, email: 'owner@test.com' }, config.jwtSecret, '1h');
}, 90_000);

afterAll(async () => {
  await stopContainer(testDb);
});

describe('POST /drones — integration', () => {
  it('inserts a drone row and returns plaintext device token', async () => {
    const res = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Alpha', model: 'DJI Mini' });

    expect(res.status).toBe(201);
    const body = res.body as { drone: { id: string }; deviceToken: string };
    expect(typeof body.drone.id).toBe('string');
    expect(typeof body.deviceToken).toBe('string');

    // Verify DB row: token is stored as SHA-256 hash
    const [row] = await testDb.db
      .select({ deviceTokenHash: drones.deviceTokenHash })
      .from(drones)
      .where(eq(drones.id, body.drone.id));
    const expectedHash = createHash('sha256').update(body.deviceToken).digest('hex');
    expect(row?.deviceTokenHash).toBe(expectedHash);
  });

  it('lists created drone under GET /drones', async () => {
    // Create a drone first
    const create = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Beta', model: 'DJI Air' });
    expect(create.status).toBe(201);

    const list = await request(app).get('/drones').set('Authorization', `Bearer ${userToken}`);
    expect(list.status).toBe(200);
    const droneList = (list.body as { drones: Array<{ name: string }> }).drones;
    expect(droneList.some((d) => d.name === 'Beta')).toBe(true);
  });
});

describe('PATCH /drones/:id — integration', () => {
  it('updates drone name in DB', async () => {
    const create = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Gamma', model: 'DJI Mavic' });
    const { id } = (create.body as { drone: { id: string } }).drone;

    const patch = await request(app)
      .patch(`/drones/${id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Gamma-Updated' });
    expect(patch.status).toBe(200);

    const [row] = await testDb.db
      .select({ name: drones.name })
      .from(drones)
      .where(eq(drones.id, id));
    expect(row?.name).toBe('Gamma-Updated');
  });
});

describe('DELETE /drones/:id — integration', () => {
  it('removes the drone row from DB', async () => {
    const create = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Delta', model: 'DJI Phantom' });
    const { id } = (create.body as { drone: { id: string } }).drone;

    const del = await request(app)
      .delete(`/drones/${id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(del.status).toBe(204);

    const rows = await testDb.db.select().from(drones).where(eq(drones.id, id));
    expect(rows).toHaveLength(0);
  });

  it('returns 403 when a different user attempts delete', async () => {
    // Create second user
    const otherUserId = randomUUID();
    await testDb.db.insert(users).values({
      id: otherUserId,
      email: 'other@test.com',
      passwordHash: await hashPassword('password123'),
    });
    const otherToken = await signToken(
      { sub: otherUserId, email: 'other@test.com' },
      config.jwtSecret,
      '1h',
    );

    const create = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Epsilon', model: 'DJI Pro' });
    const { id } = (create.body as { drone: { id: string } }).drone;

    const del = await request(app)
      .delete(`/drones/${id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(del.status).toBe(404);
  });
});
