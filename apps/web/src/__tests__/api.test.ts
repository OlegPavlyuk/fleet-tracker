import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth';

const BASE = 'http://localhost:3000';

function okFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: () => Promise.resolve(data),
  });
}

function errFetch(status: number, message: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message }),
  });
}

describe('api', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── auth.register ──────────────────────────────────────────────────────────

  describe('auth.register', () => {
    it('POSTs to /auth/register and returns token + user', async () => {
      const mockFetch = okFetch({ token: 't1', user: { id: 'u1', email: 'a@b.com' } }, 201);
      vi.stubGlobal('fetch', mockFetch);

      const result = await api.auth.register('a@b.com', 'pass1234');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/auth/register`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'a@b.com', password: 'pass1234' }),
        }),
      );
      expect(result).toEqual({ token: 't1', user: { id: 'u1', email: 'a@b.com' } });
    });

    it('throws ApiError on 409 Conflict', async () => {
      vi.stubGlobal('fetch', errFetch(409, 'Email already registered'));

      await expect(api.auth.register('a@b.com', 'pass1234')).rejects.toMatchObject({
        status: 409,
        message: 'Email already registered',
      });
    });
  });

  // ── auth.login ─────────────────────────────────────────────────────────────

  describe('auth.login', () => {
    it('POSTs to /auth/login and returns token + user', async () => {
      const mockFetch = okFetch({ token: 't2', user: { id: 'u2', email: 'x@y.com' } });
      vi.stubGlobal('fetch', mockFetch);

      const result = await api.auth.login('x@y.com', 'pass1234');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/auth/login`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'x@y.com', password: 'pass1234' }),
        }),
      );
      expect(result).toEqual({ token: 't2', user: { id: 'u2', email: 'x@y.com' } });
    });

    it('throws ApiError on 401 Unauthorized', async () => {
      vi.stubGlobal('fetch', errFetch(401, 'Invalid credentials'));

      await expect(api.auth.login('x@y.com', 'wrong')).rejects.toMatchObject({ status: 401 });
    });
  });

  // ── auth.me ────────────────────────────────────────────────────────────────

  describe('auth.me', () => {
    it('GETs /auth/me with Authorization header and returns user', async () => {
      useAuthStore.setState({ token: 'tok-me', user: null });
      const mockFetch = okFetch({ user: { id: 'u3', email: 'm@n.com' } });
      vi.stubGlobal('fetch', mockFetch);

      const result = await api.auth.me();

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/auth/me`,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({ Authorization: 'Bearer tok-me' }),
        }),
      );
      expect(result).toEqual({ id: 'u3', email: 'm@n.com' });
    });

    it('throws ApiError on 401 when no token', async () => {
      vi.stubGlobal('fetch', errFetch(401, 'Unauthorized'));

      await expect(api.auth.me()).rejects.toMatchObject({ status: 401 });
    });
  });

  // ── drones.list ────────────────────────────────────────────────────────────

  describe('drones.list', () => {
    it('GETs /drones and returns drone array', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      const drones = [
        {
          id: 'd1',
          ownerId: 'u1',
          name: 'Alpha',
          model: 'X1',
          status: 'idle',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      vi.stubGlobal('fetch', okFetch({ drones }));

      const result = await api.drones.list();

      expect(result).toEqual(drones);
    });

    it('throws ApiError on 401', async () => {
      vi.stubGlobal('fetch', errFetch(401, 'Unauthorized'));

      await expect(api.drones.list()).rejects.toMatchObject({ status: 401 });
    });
  });

  // ── drones.create ──────────────────────────────────────────────────────────

  describe('drones.create', () => {
    it('POSTs to /drones and returns drone + deviceToken', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      const drone = {
        id: 'd2',
        ownerId: 'u1',
        name: 'Beta',
        model: 'Y2',
        status: 'idle',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const mockFetch = okFetch({ drone, deviceToken: 'plain-tok' }, 201);
      vi.stubGlobal('fetch', mockFetch);

      const result = await api.drones.create('Beta', 'Y2');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/drones`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Beta', model: 'Y2' }),
        }),
      );
      expect(result).toEqual({ drone, deviceToken: 'plain-tok' });
    });

    it('throws ApiError on 400 Validation error', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      vi.stubGlobal('fetch', errFetch(400, 'Validation failed'));

      await expect(api.drones.create('', 'Y2')).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── drones.update ──────────────────────────────────────────────────────────

  describe('drones.update', () => {
    it('PATCHes /drones/:id and returns updated drone', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      const drone = {
        id: 'd1',
        ownerId: 'u1',
        name: 'Alpha v2',
        model: 'X1',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const mockFetch = okFetch({ drone });
      vi.stubGlobal('fetch', mockFetch);

      const result = await api.drones.update('d1', { name: 'Alpha v2' });

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/drones/d1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Alpha v2' }),
        }),
      );
      expect(result).toEqual(drone);
    });

    it('throws ApiError on 404 when drone not found', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      vi.stubGlobal('fetch', errFetch(404, 'Drone not found'));

      await expect(api.drones.update('bad-id', { name: 'X' })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  // ── drones.delete ──────────────────────────────────────────────────────────

  describe('drones.delete', () => {
    it('DELETEs /drones/:id and returns undefined (204)', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve(undefined) });
      vi.stubGlobal('fetch', mockFetch);

      const result = await api.drones.delete('d1');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/drones/d1`,
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(result).toBeUndefined();
    });

    it('throws ApiError on 404 when drone not found', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      vi.stubGlobal('fetch', errFetch(404, 'Drone not found'));

      await expect(api.drones.delete('bad-id')).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── telemetry.history ──────────────────────────────────────────────────────

  describe('telemetry.history', () => {
    it('GETs /telemetry/history with correct query params and returns points', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      const points = [
        {
          ts: 1000,
          lat: 50.4,
          lng: 30.5,
          altitude_m: 100,
          heading_deg: 90,
          speed_mps: 5,
          battery_pct: 80,
        },
      ];
      const mockFetch = okFetch({ droneId: 'drone-1', from: 1000, to: 2000, points });
      vi.stubGlobal('fetch', mockFetch);

      const result = await api.telemetry.history({ drone_id: 'drone-1', from: 1000, to: 2000 });

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE}/telemetry/history?drone_id=drone-1&from=1000&to=2000`,
        expect.anything(),
      );
      expect(result).toEqual(points);
    });

    it('appends bbox query param when provided', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      const mockFetch = okFetch({ droneId: 'd1', from: 0, to: 1, points: [] });
      vi.stubGlobal('fetch', mockFetch);

      await api.telemetry.history({ drone_id: 'd1', from: 0, to: 1, bbox: '30.3,50.3,30.7,50.6' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('bbox=30.3%2C50.3%2C30.7%2C50.6'),
        expect.anything(),
      );
    });

    it('throws ApiError on 403 when drone belongs to another user', async () => {
      useAuthStore.setState({ token: 'tok', user: null });
      vi.stubGlobal('fetch', errFetch(403, 'Access denied'));

      await expect(api.telemetry.history({ drone_id: 'd1', from: 0, to: 1 })).rejects.toMatchObject(
        { status: 403 },
      );
    });
  });
});
