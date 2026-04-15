# apps/web Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `apps/web` with Vite + React + react-router + TanStack Query + Zustand auth store + full API client + Login/Register pages + Dashboard layout shell + History stub.

**Architecture:** Layout-route pattern (React Router v6) — a single `AppLayout` component checks auth and renders `<Outlet />`. Zustand `persist` middleware stores JWT + user to localStorage. All API calls go through a typed `request()` wrapper that reads the token from the Zustand store.

**Tech Stack:** Vite 6, React 18, react-router-dom 6, @tanstack/react-query 5, zustand 5, happy-dom (test environment), vitest 3.

---

## File Map

| File                                      | Action | Purpose                                                  |
| ----------------------------------------- | ------ | -------------------------------------------------------- |
| `apps/web/package.json`                   | Modify | Add all runtime + dev dependencies                       |
| `apps/web/index.html`                     | Create | Vite entry HTML                                          |
| `apps/web/vite.config.ts`                 | Create | Vite + React plugin config                               |
| `apps/web/vitest.config.ts`               | Create | happy-dom environment for component/unit tests           |
| `apps/web/src/vite-env.d.ts`              | Create | `ImportMetaEnv` type for `VITE_API_URL`                  |
| `apps/web/src/lib/auth.ts`                | Create | Zustand auth store (token + user, persisted)             |
| `apps/web/src/lib/http.ts`                | Create | Thin fetch wrapper — sets Auth header, throws `ApiError` |
| `apps/web/src/lib/api.ts`                 | Create | All endpoint functions (auth, drones, telemetry)         |
| `apps/web/src/lib/ws.ts`                  | Create | Empty shell — implemented in Step 14                     |
| `apps/web/src/components/AppLayout.tsx`   | Create | Auth guard — redirects to /login if no token             |
| `apps/web/src/components/Map.tsx`         | Create | Empty shell — implemented in Step 14                     |
| `apps/web/src/components/DroneList.tsx`   | Create | Empty shell — implemented in Step 14                     |
| `apps/web/src/components/DroneMarker.tsx` | Create | Empty shell — implemented in Step 14                     |
| `apps/web/src/pages/Login.tsx`            | Create | Login form — calls api.auth.login, stores JWT            |
| `apps/web/src/pages/Register.tsx`         | Create | Register form — calls api.auth.register, stores JWT      |
| `apps/web/src/pages/Dashboard.tsx`        | Create | Layout shell: header + sidebar + map placeholder         |
| `apps/web/src/pages/History.tsx`          | Create | Stub: shows drone id from URL params                     |
| `apps/web/src/router.tsx`                 | Create | `createBrowserRouter` — all routes                       |
| `apps/web/src/main.tsx`                   | Modify | Mount React tree with QueryClient + RouterProvider       |
| `apps/web/src/__tests__/auth.test.ts`     | Create | Unit tests for Zustand auth store                        |
| `apps/web/src/__tests__/api.test.ts`      | Create | Unit tests for API client (fetch-stubbed)                |
| `vitest.config.ts` (root)                 | Modify | Add `'apps/web'` to projects array                       |

---

## Task 1: Scaffold — deps, configs, HTML

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/vite-env.d.ts`

- [ ] **Step 1.1: Update `apps/web/package.json`**

Replace the entire file:

```json
{
  "name": "@fleet-tracker/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "dependencies": {
    "@fleet-tracker/shared": "workspace:*",
    "@tanstack/react-query": "^5.62.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "happy-dom": "^16.9.4",
    "vite": "^6.2.0",
    "vitest": "^3.1.1"
  }
}
```

- [ ] **Step 1.2: Install dependencies**

```bash
pnpm install
```

Expected: lockfile updated, `node_modules` populated for `apps/web`.

- [ ] **Step 1.3: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fleet Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.4: Create `apps/web/vite.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 1.5: Create `apps/web/vitest.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
    },
  },
});
```

- [ ] **Step 1.6: Create `apps/web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
```

- [ ] **Step 1.7: Commit**

```bash
git add apps/web/package.json apps/web/index.html apps/web/vite.config.ts apps/web/vitest.config.ts apps/web/src/vite-env.d.ts pnpm-lock.yaml
git commit -m "chore(web): scaffold Vite + React app dependencies and config"
```

---

## Task 2: Zustand auth store (TDD)

**Files:**

- Create: `apps/web/src/__tests__/auth.test.ts`
- Create: `apps/web/src/lib/auth.ts`

- [ ] **Step 2.1: Write failing tests — `apps/web/src/__tests__/auth.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../lib/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
  });

  it('starts with no token and no user', () => {
    const { token, user } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();
  });

  it('login sets token and user', () => {
    useAuthStore.getState().login('tok1', { id: 'u1', email: 'a@b.com' });
    expect(useAuthStore.getState().token).toBe('tok1');
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('logout clears token and user', () => {
    useAuthStore.getState().login('tok1', { id: 'u1', email: 'a@b.com' });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('login persists to localStorage under fleet-auth key', () => {
    useAuthStore.getState().login('tok1', { id: 'u1', email: 'a@b.com' });
    const raw = localStorage.getItem('fleet-auth');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!) as { state: { token: string } };
    expect(stored.state.token).toBe('tok1');
  });

  it('logout sets token to null in localStorage', () => {
    useAuthStore.getState().login('tok1', { id: 'u1', email: 'a@b.com' });
    useAuthStore.getState().logout();
    const raw = localStorage.getItem('fleet-auth') ?? '{}';
    const stored = JSON.parse(raw) as { state?: { token?: unknown } };
    expect(stored.state?.token).toBeNull();
  });

  it('rehydrates token from pre-seeded localStorage', async () => {
    localStorage.setItem(
      'fleet-auth',
      JSON.stringify({
        state: { token: 'restored', user: { id: 'u2', email: 'x@y.com' } },
        version: 0,
      }),
    );
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().token).toBe('restored');
    expect(useAuthStore.getState().user).toEqual({ id: 'u2', email: 'x@y.com' });
  });
});
```

- [ ] **Step 2.2: Run test — verify it fails**

```bash
pnpm --filter @fleet-tracker/web test
```

Expected: FAIL — `Cannot find module '../lib/auth'`

- [ ] **Step 2.3: Implement `apps/web/src/lib/auth.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'fleet-auth' },
  ),
);
```

- [ ] **Step 2.4: Run test — verify it passes**

```bash
pnpm --filter @fleet-tracker/web test
```

Expected: 6 passed | 0 failed

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/src/__tests__/auth.test.ts apps/web/src/lib/auth.ts
git commit -m "feat(web): add Zustand auth store with localStorage persistence"
```

---

## Task 3: http.ts + api.ts (TDD)

**Files:**

- Create: `apps/web/src/__tests__/api.test.ts`
- Create: `apps/web/src/lib/http.ts`
- Create: `apps/web/src/lib/api.ts`

- [ ] **Step 3.1: Write failing tests — `apps/web/src/__tests__/api.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ApiError } from '../lib/http';
import { useAuthStore } from '../lib/auth';

const BASE = 'http://localhost:3000';

function okFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: async () => data,
  });
}

function errFetch(status: number, message: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ message }),
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
        .mockResolvedValue({ ok: true, status: 204, json: async () => undefined });
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
```

- [ ] **Step 3.2: Run test — verify it fails**

```bash
pnpm --filter @fleet-tracker/web test
```

Expected: FAIL — `Cannot find module '../lib/api'` and `Cannot find module '../lib/http'`

- [ ] **Step 3.3: Implement `apps/web/src/lib/http.ts`**

```ts
import { useAuthStore } from './auth.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, body.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}
```

- [ ] **Step 3.4: Implement `apps/web/src/lib/api.ts`**

```ts
import type { DroneStatus } from '@fleet-tracker/shared';
import { request } from './http.js';

// ── Response types ────────────────────────────────────────────────────────────

export interface DroneResponse {
  id: string;
  ownerId: string;
  name: string;
  model: string;
  status: DroneStatus;
  createdAt: string;
}

export interface HistoryPoint {
  ts: number;
  lat: number;
  lng: number;
  altitude_m: number;
  heading_deg: number;
  speed_mps: number;
  battery_pct: number;
}

export interface HistoryParams {
  drone_id: string;
  from: number;
  to: number;
  bbox?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

interface AuthResult {
  token: string;
  user: { id: string; email: string };
}

async function register(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function login(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function me(): Promise<{ id: string; email: string }> {
  const res = await request<{ user: { id: string; email: string } }>('/auth/me');
  return res.user;
}

// ── Drones ────────────────────────────────────────────────────────────────────

async function listDrones(): Promise<DroneResponse[]> {
  const res = await request<{ drones: DroneResponse[] }>('/drones');
  return res.drones;
}

async function createDrone(
  name: string,
  model: string,
): Promise<{ drone: DroneResponse; deviceToken: string }> {
  return request<{ drone: DroneResponse; deviceToken: string }>('/drones', {
    method: 'POST',
    body: JSON.stringify({ name, model }),
  });
}

async function updateDrone(
  id: string,
  patch: { name?: string; model?: string; status?: DroneStatus },
): Promise<DroneResponse> {
  const res = await request<{ drone: DroneResponse }>(`/drones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.drone;
}

async function deleteDrone(id: string): Promise<void> {
  await request<void>(`/drones/${id}`, { method: 'DELETE' });
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

async function history(params: HistoryParams): Promise<HistoryPoint[]> {
  const qs = new URLSearchParams({
    drone_id: params.drone_id,
    from: String(params.from),
    to: String(params.to),
  });
  if (params.bbox !== undefined) qs.set('bbox', params.bbox);
  const res = await request<{
    droneId: string;
    from: number;
    to: number;
    points: HistoryPoint[];
  }>(`/telemetry/history?${qs.toString()}`);
  return res.points;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const api = {
  auth: { register, login, me },
  drones: { list: listDrones, create: createDrone, update: updateDrone, delete: deleteDrone },
  telemetry: { history },
};
```

- [ ] **Step 3.5: Run test — verify all pass**

```bash
pnpm --filter @fleet-tracker/web test
```

Expected: 22 passed | 0 failed (6 auth + 16 api)

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/src/__tests__/api.test.ts apps/web/src/lib/http.ts apps/web/src/lib/api.ts
git commit -m "feat(web): add typed API client and http request wrapper"
```

---

## Task 4: Router, AppLayout, and shell components

**Files:**

- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/components/AppLayout.tsx`
- Create: `apps/web/src/components/Map.tsx`
- Create: `apps/web/src/components/DroneList.tsx`
- Create: `apps/web/src/components/DroneMarker.tsx`
- Create: `apps/web/src/lib/ws.ts`

- [ ] **Step 4.1: Create `apps/web/src/components/AppLayout.tsx`**

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../lib/auth';

export function AppLayout() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 4.2: Create `apps/web/src/components/Map.tsx`**

```tsx
// Populated in Step 14 — MapLibre integration
export function Map() {
  return <div id="map" style={{ width: '100%', height: '100%' }} />;
}
```

- [ ] **Step 4.3: Create `apps/web/src/components/DroneList.tsx`**

```tsx
// Populated in Step 14
export function DroneList() {
  return <div />;
}
```

- [ ] **Step 4.4: Create `apps/web/src/components/DroneMarker.tsx`**

```tsx
// Populated in Step 14
export function DroneMarker() {
  return null;
}
```

- [ ] **Step 4.5: Create `apps/web/src/lib/ws.ts`**

```ts
// WebSocket client — implemented in Step 14
export {};
```

- [ ] **Step 4.6: Create `apps/web/src/router.tsx`**

Note: pages don't exist yet — create stubs (empty default exports) if TypeScript errors on import. They'll be replaced in Task 5.

```tsx
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/drones/:id/history', element: <History /> },
    ],
  },
]);
```

- [ ] **Step 4.7: Commit**

```bash
git add apps/web/src/components/ apps/web/src/lib/ws.ts apps/web/src/router.tsx
git commit -m "feat(web): add router, AppLayout auth guard, and component shells"
```

---

## Task 5: Pages — Login, Register, Dashboard, History + main.tsx

**Files:**

- Create: `apps/web/src/pages/Login.tsx`
- Create: `apps/web/src/pages/Register.tsx`
- Create: `apps/web/src/pages/Dashboard.tsx`
- Create: `apps/web/src/pages/History.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 5.1: Create `apps/web/src/pages/Login.tsx`**

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { token, user } = await api.auth.login(email, password);
      login(token, user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div>
      <h1>Login</h1>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
        </div>
        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Login</button>
      </form>
      <p>
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5.2: Create `apps/web/src/pages/Register.tsx`**

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth';

export function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { token, user } = await api.auth.register(email, password);
      login(token, user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <div>
      <h1>Register</h1>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
        </div>
        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Register</button>
      </form>
      <p>
        Have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5.3: Create `apps/web/src/pages/Dashboard.tsx`**

```tsx
import { useNavigate } from 'react-router-dom';
import { DroneList } from '../components/DroneList';
import { Map } from '../components/Map';
import { useAuthStore } from '../lib/auth';

export function Dashboard() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #ccc',
        }}
      >
        <span>Fleet Tracker</span>
        <button onClick={handleLogout}>Logout</button>
      </header>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 240, overflowY: 'auto', borderRight: '1px solid #ccc' }}>
          <DroneList />
        </aside>
        <main style={{ flex: 1 }}>
          <Map />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: Create `apps/web/src/pages/History.tsx`**

```tsx
import { useParams } from 'react-router-dom';

export function History() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1>Drone History</h1>
      <p>Drone: {id}</p>
      <p>History view — coming in Step 15</p>
    </div>
  );
}
```

- [ ] **Step 5.5: Write `apps/web/src/main.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

const queryClient = new QueryClient();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 5.6: Run tests — all still passing**

```bash
pnpm --filter @fleet-tracker/web test
```

Expected: 22 passed | 0 failed

- [ ] **Step 5.7: Commit**

```bash
git add apps/web/src/pages/ apps/web/src/main.tsx
git commit -m "feat(web): add Login, Register, Dashboard shell, and History stub pages"
```

---

## Task 6: Wire into root vitest workspace + final verification

**Files:**

- Modify: `vitest.config.ts` (root)

- [ ] **Step 6.1: Add `apps/web` to root vitest projects**

In `vitest.config.ts` at the repo root, change:

```ts
// Before
projects: ['packages/*', 'apps/api', 'apps/emulator'],

// After
projects: ['packages/*', 'apps/api', 'apps/emulator', 'apps/web'],
```

- [ ] **Step 6.2: Run full test suite**

```bash
pnpm test
```

Expected: all previous tests pass + 22 new web tests. Total should be ~163 passed | 0 failed.

- [ ] **Step 6.3: Run typecheck across all workspaces**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 6.4: Run lint**

```bash
pnpm lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6.5: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add apps/web to root vitest workspace"
```

- [ ] **Step 6.6: Update `docs/PROGRESS.md`**

Change current state to:

```
- **Current step**: ready to start v1 Step 14 — Dashboard map (MapLibre + WS subscription + markers + popup)
- **Last session**: 2026-04-15 — v1 Step 13 complete
```

Mark Step 13 as `[x]` in the checklist. Add session log entry summarizing what was built.

- [ ] **Step 6.7: Commit progress update**

```bash
git add docs/PROGRESS.md
git commit -m "docs: mark v1 Step 13 done in PROGRESS.md"
```
