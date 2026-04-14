import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorMiddleware } from '../../errors/middleware.js';
import { createDroneRouter } from '../routes.js';
import type { DroneDeps, DroneRecord } from '../routes.js';
import { signToken } from '../../auth/jwt.js';

const SECRET = 'test-secret-that-is-at-least-32-chars-long';
const USER_A = 'user-a-uuid-0000-0000-000000000001';
const USER_B = 'user-b-uuid-0000-0000-000000000002';

async function tokenFor(userId: string, email: string): Promise<string> {
  return signToken({ sub: userId, email }, SECRET, '1h');
}

function makeDeps(): DroneDeps {
  const store = new Map<string, DroneRecord>();
  return {
    listByOwner: vi.fn((ownerId: string) =>
      Promise.resolve([...store.values()].filter((d) => d.ownerId === ownerId)),
    ),
    create: vi.fn((data: DroneRecord) => {
      store.set(data.id, data);
      return Promise.resolve(data);
    }),
    findByIdAndOwner: vi.fn((id: string, ownerId: string) =>
      Promise.resolve(store.get(id)?.ownerId === ownerId ? (store.get(id) ?? null) : null),
    ),
    update: vi.fn(
      (
        id: string,
        ownerId: string,
        patch: Partial<Pick<DroneRecord, 'name' | 'model' | 'status'>>,
      ) => {
        const existing = store.get(id);
        if (!existing || existing.ownerId !== ownerId) return Promise.resolve(null);
        const updated = { ...existing, ...patch };
        store.set(id, updated);
        return Promise.resolve(updated);
      },
    ),
    delete: vi.fn((id: string, ownerId: string) => {
      const existing = store.get(id);
      if (!existing || existing.ownerId !== ownerId) return Promise.resolve(false);
      store.delete(id);
      return Promise.resolve(true);
    }),
  };
}

function buildApp(deps: DroneDeps) {
  const app = express();
  app.use(express.json());
  app.use('/drones', createDroneRouter(deps));
  app.use(errorMiddleware);
  return app;
}

interface DroneBody {
  id: string;
  ownerId: string;
  name: string;
  model: string;
  status: string;
  createdAt: string;
}

interface CreateBody {
  drone: DroneBody;
  deviceToken: string;
}

describe('GET /drones', () => {
  let deps: DroneDeps;
  let app: ReturnType<typeof buildApp>;
  let token: string;

  beforeEach(async () => {
    deps = makeDeps();
    app = buildApp(deps);
    token = await tokenFor(USER_A, 'a@example.com');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/drones');
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty array when owner has no drones', async () => {
    const res = await request(app).get('/drones').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ drones: [] });
  });

  it('returns only the authenticated owner drones, not other users', async () => {
    // Pre-create one drone for USER_A via POST
    await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha', model: 'DJI Mini 3' });

    // Pre-create one drone for USER_B (directly via deps)
    const bDrone: DroneRecord = {
      id: 'drone-b-id',
      ownerId: USER_B,
      name: 'Beta',
      model: 'DJI Air 3',
      status: 'idle',
      deviceTokenHash: 'some-hash',
      createdAt: new Date(),
    };
    await deps.create(bDrone);

    const res = await request(app).get('/drones').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const drones = (res.body as { drones: DroneBody[] }).drones;
    expect(drones).toHaveLength(1);
    expect(drones[0]).toMatchObject({ name: 'Alpha', ownerId: USER_A });
    // deviceTokenHash must not be exposed
    expect(drones[0]).not.toHaveProperty('deviceTokenHash');
  });
});

describe('POST /drones', () => {
  let deps: DroneDeps;
  let app: ReturnType<typeof buildApp>;
  let token: string;

  beforeEach(async () => {
    deps = makeDeps();
    app = buildApp(deps);
    token = await tokenFor(USER_A, 'a@example.com');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/drones').send({ name: 'X', model: 'Y' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${token}`)
      .send({ model: 'DJI Mini 3' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when model is missing', async () => {
    const res = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with drone and one-time deviceToken on valid body', async () => {
    const res = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha', model: 'DJI Mini 3' });

    expect(res.status).toBe(201);
    const body = res.body as CreateBody;
    expect(typeof body.deviceToken).toBe('string');
    expect(body.deviceToken.length).toBeGreaterThan(0);
    expect(body.drone).toMatchObject({
      name: 'Alpha',
      model: 'DJI Mini 3',
      status: 'idle',
      ownerId: USER_A,
    });
    expect(body.drone).not.toHaveProperty('deviceTokenHash');
    expect(typeof body.drone.id).toBe('string');
  });
});

describe('PATCH /drones/:id', () => {
  let deps: DroneDeps;
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let droneId: string;

  beforeEach(async () => {
    deps = makeDeps();
    app = buildApp(deps);
    token = await tokenFor(USER_A, 'a@example.com');

    // Create a drone to patch
    const res = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha', model: 'DJI Mini 3' });
    droneId = (res.body as CreateBody).drone.id;
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).patch(`/drones/${droneId}`).send({ name: 'Beta' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when drone does not exist', async () => {
    const res = await request(app)
      .patch('/drones/non-existent-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Beta' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when drone belongs to another user', async () => {
    const tokenB = await tokenFor(USER_B, 'b@example.com');
    const res = await request(app)
      .patch(`/drones/${droneId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it('returns 200 with updated drone', async () => {
    const res = await request(app)
      .patch(`/drones/${droneId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Beta', status: 'active' });

    expect(res.status).toBe(200);
    const body = res.body as { drone: DroneBody };
    expect(body.drone).toMatchObject({ name: 'Beta', status: 'active', model: 'DJI Mini 3' });
    expect(body.drone).not.toHaveProperty('deviceTokenHash');
  });
});

describe('DELETE /drones/:id', () => {
  let deps: DroneDeps;
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let droneId: string;

  beforeEach(async () => {
    deps = makeDeps();
    app = buildApp(deps);
    token = await tokenFor(USER_A, 'a@example.com');

    const res = await request(app)
      .post('/drones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha', model: 'DJI Mini 3' });
    droneId = (res.body as CreateBody).drone.id;
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).delete(`/drones/${droneId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when drone does not exist', async () => {
    const res = await request(app)
      .delete('/drones/non-existent-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when drone belongs to another user', async () => {
    const tokenB = await tokenFor(USER_B, 'b@example.com');
    const res = await request(app)
      .delete(`/drones/${droneId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('returns 204 on successful deletion', async () => {
    const res = await request(app)
      .delete(`/drones/${droneId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
