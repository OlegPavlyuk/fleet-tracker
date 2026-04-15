import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorMiddleware } from '../../errors/middleware.js';
import { createTelemetryRouter } from '../routes.js';
import type { TelemetryDeps, HistoryPoint } from '../routes.js';
import { signToken } from '../../auth/jwt.js';

const SECRET = 'test-secret-that-is-at-least-32-chars-long';
const USER_A = 'user-a-uuid-0000-0000-000000000001';
const USER_B = 'user-b-uuid-0000-0000-000000000002';
const DRONE_ID = '550e8400-e29b-41d4-a716-446655440001';

const FROM = 1700000000000;
const TO = 1700003600000;

async function tokenFor(userId: string): Promise<string> {
  return signToken({ sub: userId, email: `${userId}@test.com` }, SECRET, '1h');
}

const SAMPLE_POINT: HistoryPoint = {
  ts: 1700001000000,
  lat: 50.4501,
  lng: 30.5234,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
};

function makeDeps(overrides?: Partial<TelemetryDeps>): TelemetryDeps {
  return {
    findDroneOwner: vi.fn().mockResolvedValue({ ownerId: USER_A }),
    queryHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function buildApp(deps: TelemetryDeps) {
  const app = express();
  app.use(express.json());
  app.use('/telemetry', createTelemetryRouter(deps));
  app.use(errorMiddleware);
  return app;
}

describe('GET /telemetry/history', () => {
  let deps: TelemetryDeps;
  let token: string;

  beforeEach(async () => {
    deps = makeDeps();
    token = await tokenFor(USER_A);
  });

  // ── Auth ─────────────────────────────────────────────────────────────────────

  it('returns 401 when no Authorization header', async () => {
    const app = buildApp(deps);
    const res = await request(app).get(
      `/telemetry/history?drone_id=${DRONE_ID}&from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(401);
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  it('returns 400 when drone_id is missing', async () => {
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when drone_id is not a valid UUID', async () => {
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=not-a-uuid&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when from is missing', async () => {
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&to=${TO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when to is missing', async () => {
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=${FROM}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when from is not a number', async () => {
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=abc&to=${TO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when from >= to', async () => {
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=${TO}&to=${FROM}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when bbox is malformed', async () => {
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=${FROM}&to=${TO}&bbox=1,2,3`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  // ── Authorization ────────────────────────────────────────────────────────────

  it('returns 404 when drone does not exist', async () => {
    deps = makeDeps({ findDroneOwner: vi.fn().mockResolvedValue(null) });
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when drone belongs to another user', async () => {
    deps = makeDeps({ findDroneOwner: vi.fn().mockResolvedValue({ ownerId: USER_B }) });
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('returns 200 with empty points when no telemetry in range', async () => {
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ droneId: DRONE_ID, points: [] });
  });

  it('returns 200 with history points', async () => {
    deps = makeDeps({ queryHistory: vi.fn().mockResolvedValue([SAMPLE_POINT]) });
    const app = buildApp(deps);
    const res = await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = res.body as { points: unknown[] };
    expect(body.points).toHaveLength(1);
    expect(body.points[0]).toMatchObject({ ts: SAMPLE_POINT.ts, lat: 50.4501 });
  });

  it('passes from/to as Date objects and bbox to queryHistory', async () => {
    const app = buildApp(deps);
    await request(app)
      .get(`/telemetry/history?drone_id=${DRONE_ID}&from=${FROM}&to=${TO}&bbox=30.0,50.0,31.0,51.0`)
      .set('Authorization', `Bearer ${token}`);

    expect(deps.queryHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        droneId: DRONE_ID,
        from: new Date(FROM),
        to: new Date(TO),
        bbox: { minLng: 30.0, minLat: 50.0, maxLng: 31.0, maxLat: 51.0 },
      }),
    );
  });
});
