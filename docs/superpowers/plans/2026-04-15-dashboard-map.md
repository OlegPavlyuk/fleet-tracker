# Dashboard Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the live drone map dashboard — MapLibre GL JS map with a GeoJSON circle layer updated via WebSocket, Zustand drone store, sidebar drone list, and a floating popup on drone click.

**Architecture:** `FleetWSClient` (plain TS class) connects to `/ws/stream?token=<jwt>`, parses `snapshot`/`update` messages, and calls callbacks. `useFleetWS` hook adapts it to React lifecycle. `useDroneStore` (Zustand) holds `Map<droneId, StateSnapshot>` and `selectedId`. `Map.tsx` initialises MapLibre once via `useRef`, drives a GeoJSON source from the store, and manages a floating popup. `DroneList.tsx` renders a sidebar from the same store.

**Tech Stack:** `maplibre-gl`, Zustand 5, TanStack Query 5, `@testing-library/react`, Vitest + happy-dom, `@fleet-tracker/shared` zod types

---

## File Map

| File                                      | Action       | Responsibility                                                              |
| ----------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| `apps/web/src/lib/ws.ts`                  | Replace stub | `FleetWSClient` class — socket lifecycle, message parsing, `isClosed` guard |
| `apps/web/src/lib/droneStore.ts`          | Create       | Zustand store — `Map<id,StateSnapshot>`, `selectedId`, three actions        |
| `apps/web/src/lib/useFleetWS.ts`          | Create       | React hook — creates/cleans up `FleetWSClient`, wires to store              |
| `apps/web/src/components/DroneList.tsx`   | Replace stub | Sidebar — reads store + TanStack Query cache, renders sorted rows           |
| `apps/web/src/components/Map.tsx`         | Replace stub | MapLibre init (once), GeoJSON update effect, popup effect                   |
| `apps/web/src/components/DroneMarker.tsx` | Delete       | Dead code — replaced by GeoJSON layer                                       |
| `apps/web/src/pages/Dashboard.tsx`        | Modify       | Mount `useFleetWS`                                                          |
| `apps/web/src/vite-env.d.ts`              | Modify       | Add `VITE_MAP_STYLE_URL` to `ImportMetaEnv`                                 |
| `apps/web/vitest.config.ts`               | Modify       | Add `css: false` so MapLibre CSS import doesn't break tests                 |
| `apps/web/package.json`                   | Modify       | Add `maplibre-gl` dep, `@testing-library/react` dev dep                     |
| `.env.example` (root)                     | Modify       | Add `VITE_API_URL` and `VITE_MAP_STYLE_URL` examples                        |

---

## Task 1: Install dependencies and configure environment

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/src/vite-env.d.ts`
- Modify: `apps/web/vitest.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install maplibre-gl and testing library**

```bash
pnpm --filter @fleet-tracker/web add maplibre-gl
pnpm --filter @fleet-tracker/web add -D @testing-library/react @testing-library/user-event
```

Expected output: packages added, `apps/web/package.json` updated with `"maplibre-gl"` in `dependencies` and `"@testing-library/react"` + `"@testing-library/user-event"` in `devDependencies`.

- [ ] **Step 2: Add VITE_MAP_STYLE_URL to env type declarations**

Replace the content of `apps/web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
}
```

- [ ] **Step 3: Disable CSS processing in tests**

Replace `apps/web/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    css: false,
    coverage: {
      provider: 'v8',
    },
  },
});
```

`css: false` tells Vitest to treat all CSS imports (including `maplibre-gl/dist/maplibre-gl.css`) as empty modules so tests don't fail on CSS parsing.

- [ ] **Step 4: Add env var examples to root .env.example**

Append to `.env.example`:

```
# Web
VITE_API_URL=http://localhost:3000
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

- [ ] **Step 5: Verify typecheck passes after env change**

```bash
pnpm --filter @fleet-tracker/web typecheck
```

Expected: `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/vite-env.d.ts apps/web/vitest.config.ts .env.example pnpm-lock.yaml
git commit -m "chore(web): add maplibre-gl dep and VITE_MAP_STYLE_URL env config"
```

---

## Task 2: useDroneStore (Zustand)

**Files:**

- Create: `apps/web/src/lib/droneStore.ts`
- Create: `apps/web/src/__tests__/droneStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/__tests__/droneStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { StateSnapshot } from '@fleet-tracker/shared';
import { useDroneStore } from '../lib/droneStore';

const s1: StateSnapshot = {
  droneId: 'd1',
  ts: 1000,
  lat: 50.4,
  lng: 30.5,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
  status: 'active',
};
const s2: StateSnapshot = {
  droneId: 'd2',
  ts: 1001,
  lat: 50.5,
  lng: 30.6,
  altitude_m: 150,
  heading_deg: 90,
  speed_mps: 5,
  battery_pct: 20,
  status: 'idle',
};

describe('useDroneStore', () => {
  beforeEach(() => {
    useDroneStore.setState({ drones: new Map(), selectedId: null });
  });

  it('starts with empty drones and no selection', () => {
    const { drones, selectedId } = useDroneStore.getState();
    expect(drones.size).toBe(0);
    expect(selectedId).toBeNull();
  });

  it('setSnapshot populates drones keyed by droneId', () => {
    useDroneStore.getState().setSnapshot([s1, s2]);
    const { drones } = useDroneStore.getState();
    expect(drones.size).toBe(2);
    expect(drones.get('d1')).toEqual(s1);
    expect(drones.get('d2')).toEqual(s2);
  });

  it('setSnapshot fully replaces prior state (no residual entries)', () => {
    useDroneStore.getState().setSnapshot([s1, s2]);
    useDroneStore.getState().setSnapshot([s1]);
    const { drones } = useDroneStore.getState();
    expect(drones.size).toBe(1);
    expect(drones.has('d2')).toBe(false);
  });

  it('updateDrone updates exactly one entry', () => {
    useDroneStore.getState().setSnapshot([s1, s2]);
    const updated = { ...s1, battery_pct: 42 };
    useDroneStore.getState().updateDrone(updated);
    const { drones } = useDroneStore.getState();
    expect(drones.get('d1')?.battery_pct).toBe(42);
    expect(drones.get('d2')).toEqual(s2); // unchanged
    expect(drones.size).toBe(2);
  });

  it('updateDrone adds entry if droneId not in map', () => {
    useDroneStore.getState().setSnapshot([s1]);
    useDroneStore.getState().updateDrone(s2);
    expect(useDroneStore.getState().drones.size).toBe(2);
  });

  it('selectDrone sets selectedId', () => {
    useDroneStore.getState().selectDrone('d1');
    expect(useDroneStore.getState().selectedId).toBe('d1');
  });

  it('selectDrone(null) clears selection', () => {
    useDroneStore.getState().selectDrone('d1');
    useDroneStore.getState().selectDrone(null);
    expect(useDroneStore.getState().selectedId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose droneStore
```

Expected: fails with `Cannot find module '../lib/droneStore'`.

- [ ] **Step 3: Implement useDroneStore**

Create `apps/web/src/lib/droneStore.ts`:

```ts
import { create } from 'zustand';
import type { StateSnapshot } from '@fleet-tracker/shared';

interface DroneState {
  drones: Map<string, StateSnapshot>;
  selectedId: string | null;
  setSnapshot: (arr: StateSnapshot[]) => void;
  updateDrone: (snap: StateSnapshot) => void;
  selectDrone: (id: string | null) => void;
}

export const useDroneStore = create<DroneState>()((set) => ({
  drones: new Map(),
  selectedId: null,

  setSnapshot: (arr) => set({ drones: new Map(arr.map((s) => [s.droneId, s])) }),

  updateDrone: (snap) =>
    set((state) => {
      const drones = new Map(state.drones);
      drones.set(snap.droneId, snap);
      return { drones };
    }),

  selectDrone: (id) => set({ selectedId: id }),
}));
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose droneStore
```

Expected: `7 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/droneStore.ts apps/web/src/__tests__/droneStore.test.ts
git commit -m "feat(web): add useDroneStore Zustand store for live drone state"
```

---

## Task 3: FleetWSClient

**Files:**

- Modify: `apps/web/src/lib/ws.ts` (replace stub)
- Create: `apps/web/src/__tests__/ws.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/__tests__/ws.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '@fleet-tracker/shared';
import { FleetWSClient } from '../lib/ws';

const snap: StateSnapshot = {
  droneId: 'd1',
  ts: 1000,
  lat: 50.4,
  lng: 30.5,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
  status: 'active',
};

// Minimal mock that captures event listeners and lets tests emit events
class MockWebSocket {
  static last: MockWebSocket;
  url: string;
  private listeners: Record<string, Array<(e: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.last = this;
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }

  close() {}

  /** Test helper: trigger a listener */
  emit(type: string, event: unknown) {
    this.listeners[type]?.forEach((fn) => fn(event));
  }
}

describe('FleetWSClient', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens WebSocket with token in query string', () => {
    const client = new FleetWSClient('abc123', { onSnapshot: vi.fn(), onUpdate: vi.fn() });
    expect(MockWebSocket.last.url).toContain('token=abc123');
    client.close();
  });

  it('dispatches onSnapshot when snapshot message arrives', () => {
    const onSnapshot = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot, onUpdate: vi.fn() });

    MockWebSocket.last.emit('message', {
      data: JSON.stringify({ type: 'snapshot', payload: [snap] }),
    });

    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledWith([snap]);
    client.close();
  });

  it('dispatches onUpdate when update message arrives', () => {
    const onUpdate = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot: vi.fn(), onUpdate });

    MockWebSocket.last.emit('message', {
      data: JSON.stringify({ type: 'update', payload: snap }),
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(snap);
    client.close();
  });

  it('does NOT call callbacks after close()', () => {
    const onSnapshot = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot, onUpdate: vi.fn() });
    client.close();

    MockWebSocket.last.emit('message', {
      data: JSON.stringify({ type: 'snapshot', payload: [snap] }),
    });

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('ignores malformed JSON without throwing', () => {
    const onSnapshot = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot, onUpdate: vi.fn() });

    expect(() => {
      MockWebSocket.last.emit('message', { data: '{not-json' });
    }).not.toThrow();

    expect(onSnapshot).not.toHaveBeenCalled();
    client.close();
  });

  it('ignores unknown message types without throwing', () => {
    const onUpdate = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot: vi.fn(), onUpdate });

    expect(() => {
      MockWebSocket.last.emit('message', {
        data: JSON.stringify({ type: 'error', message: 'oops' }),
      });
    }).not.toThrow();

    expect(onUpdate).not.toHaveBeenCalled();
    client.close();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose ws
```

Expected: fails — `ws.ts` currently exports `{}`.

- [ ] **Step 3: Implement FleetWSClient**

Replace `apps/web/src/lib/ws.ts`:

```ts
import type { ServerMessage, StateSnapshot } from '@fleet-tracker/shared';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const WS_BASE = apiUrl.replace(/^https?/, (m) => (m === 'https' ? 'wss' : 'ws'));

interface FleetWSCallbacks {
  onSnapshot: (arr: StateSnapshot[]) => void;
  onUpdate: (snap: StateSnapshot) => void;
  onError?: (e: Event) => void;
}

export class FleetWSClient {
  private socket: WebSocket;
  private isClosed = false;

  constructor(token: string, callbacks: FleetWSCallbacks) {
    this.socket = new WebSocket(`${WS_BASE}/ws/stream?token=${encodeURIComponent(token)}`);

    this.socket.addEventListener('message', (e: MessageEvent) => {
      if (this.isClosed) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data as string) as ServerMessage;
      } catch {
        console.warn('[FleetWSClient] failed to parse message', e.data);
        return;
      }
      if (msg.type === 'snapshot') callbacks.onSnapshot(msg.payload);
      else if (msg.type === 'update') callbacks.onUpdate(msg.payload);
    });

    this.socket.addEventListener('error', (e: Event) => {
      if (this.isClosed) return;
      console.warn('[FleetWSClient] socket error', e);
      callbacks.onError?.(e);
    });

    this.socket.addEventListener('close', () => {
      if (this.isClosed) return;
      console.warn('[FleetWSClient] socket closed unexpectedly');
    });
  }

  close(): void {
    this.isClosed = true;
    this.socket.close();
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose ws
```

Expected: `6 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ws.ts apps/web/src/__tests__/ws.test.ts
git commit -m "feat(web): implement FleetWSClient with isClosed guard"
```

---

## Task 4: useFleetWS hook

**Files:**

- Create: `apps/web/src/lib/useFleetWS.ts`
- Create: `apps/web/src/__tests__/useFleetWS.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/__tests__/useFleetWS.test.tsx`:

```ts
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDroneStore } from '../lib/droneStore';
import { useFleetWS } from '../lib/useFleetWS';

// Mock FleetWSClient so no real WebSocket is opened
const mockClose = vi.fn();
const MockFleetWSClient = vi.fn().mockImplementation(() => ({ close: mockClose }));

vi.mock('../lib/ws', () => ({
  FleetWSClient: MockFleetWSClient,
}));

describe('useFleetWS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDroneStore.setState({ drones: new Map(), selectedId: null });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates FleetWSClient with the provided token', () => {
    const { unmount } = renderHook(() => useFleetWS('my-token'));
    expect(MockFleetWSClient).toHaveBeenCalledOnce();
    expect(MockFleetWSClient).toHaveBeenCalledWith(
      'my-token',
      expect.objectContaining({ onSnapshot: expect.any(Function), onUpdate: expect.any(Function) }),
    );
    unmount();
  });

  it('calls close() on unmount', () => {
    const { unmount } = renderHook(() => useFleetWS('tok'));
    unmount();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('does nothing when token is null', () => {
    renderHook(() => useFleetWS(null));
    expect(MockFleetWSClient).not.toHaveBeenCalled();
  });

  it('reconnects (new client) when token changes', () => {
    const { rerender, unmount } = renderHook(({ token }: { token: string }) => useFleetWS(token), {
      initialProps: { token: 'tok-a' },
    });
    expect(MockFleetWSClient).toHaveBeenCalledTimes(1);

    rerender({ token: 'tok-b' });

    // old client closed, new client created
    expect(mockClose).toHaveBeenCalledOnce();
    expect(MockFleetWSClient).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('onSnapshot callback calls store.setSnapshot', () => {
    renderHook(() => useFleetWS('tok'));
    const { onSnapshot } = MockFleetWSClient.mock.calls[0][1] as {
      onSnapshot: (arr: unknown[]) => void;
    };
    const snap = {
      droneId: 'd1',
      ts: 1,
      lat: 0,
      lng: 0,
      altitude_m: 0,
      heading_deg: 0,
      speed_mps: 0,
      battery_pct: 100,
      status: 'active',
    };
    onSnapshot([snap]);
    expect(useDroneStore.getState().drones.get('d1')).toEqual(snap);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose useFleetWS
```

Expected: fails — `useFleetWS` module does not exist.

- [ ] **Step 3: Implement useFleetWS**

Create `apps/web/src/lib/useFleetWS.ts`:

```ts
import { useEffect } from 'react';
import { FleetWSClient } from './ws.js';
import { useDroneStore } from './droneStore.js';

export function useFleetWS(token: string | null): void {
  const setSnapshot = useDroneStore((s) => s.setSnapshot);
  const updateDrone = useDroneStore((s) => s.updateDrone);

  useEffect(() => {
    if (!token) return;
    const client = new FleetWSClient(token, {
      onSnapshot: setSnapshot,
      onUpdate: updateDrone,
    });
    return () => client.close();
  }, [token, setSnapshot, updateDrone]);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose useFleetWS
```

Expected: `5 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/useFleetWS.ts apps/web/src/__tests__/useFleetWS.test.tsx
git commit -m "feat(web): add useFleetWS hook — bridges FleetWSClient to useDroneStore"
```

---

## Task 5: DroneList component

**Files:**

- Modify: `apps/web/src/components/DroneList.tsx` (replace stub)
- Create: `apps/web/src/__tests__/DroneList.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/__tests__/DroneList.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '@fleet-tracker/shared';
import { useDroneStore } from '../lib/droneStore';

// Stub TanStack Query — always returns empty drone list (no REST needed)
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
}));

import { DroneList } from '../components/DroneList';

const s1: StateSnapshot = {
  droneId: 'd1',
  ts: 1,
  lat: 0,
  lng: 0,
  altitude_m: 0,
  heading_deg: 0,
  speed_mps: 0,
  battery_pct: 87,
  status: 'active',
};
const s2: StateSnapshot = {
  droneId: 'd2',
  ts: 2,
  lat: 0,
  lng: 0,
  altitude_m: 0,
  heading_deg: 0,
  speed_mps: 0,
  battery_pct: 18,
  status: 'idle',
};

describe('DroneList', () => {
  beforeEach(() => {
    useDroneStore.setState({ drones: new Map(), selectedId: null });
  });
  afterEach(() => {
    cleanup();
  });

  it('shows placeholder when no drones', () => {
    render(<DroneList />);
    expect(screen.getByText(/no drones online/i)).toBeTruthy();
  });

  it('renders a row for each drone', () => {
    useDroneStore.setState({
      drones: new Map([
        ['d1', s1],
        ['d2', s2],
      ]),
    });
    render(<DroneList />);
    // With no name map, falls back to droneId
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('d2')).toBeTruthy();
  });

  it('shows battery percentage', () => {
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    render(<DroneList />);
    expect(screen.getByText(/87%/)).toBeTruthy();
  });

  it('clicking a row calls selectDrone with that droneId', async () => {
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    render(<DroneList />);
    await userEvent.click(screen.getByText('d1'));
    expect(useDroneStore.getState().selectedId).toBe('d1');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose DroneList
```

Expected: fails — stub `DroneList` renders `<div />`, not real content.

- [ ] **Step 3: Implement DroneList**

Replace `apps/web/src/components/DroneList.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { DroneResponse } from '../lib/api.js';
import { api } from '../lib/api.js';
import { useDroneStore } from '../lib/droneStore.js';

export function DroneList() {
  const drones = useDroneStore((s) => s.drones);
  const selectedId = useDroneStore((s) => s.selectedId);
  const selectDrone = useDroneStore((s) => s.selectDrone);

  const { data: droneList = [] } = useQuery<DroneResponse[]>({
    queryKey: ['drones'],
    queryFn: api.drones.list,
    staleTime: 10 * 60 * 1000, // 10 min — names rarely change
  });

  const nameMap = useMemo(
    () => new Map<string, string>(droneList.map((d) => [d.id, d.name])),
    [droneList],
  );

  const sorted = useMemo(
    () =>
      [...drones.values()].sort((a, b) =>
        (nameMap.get(a.droneId) ?? a.droneId).localeCompare(nameMap.get(b.droneId) ?? b.droneId),
      ),
    [drones, nameMap],
  );

  if (sorted.length === 0) {
    return (
      <div style={{ padding: '1rem', color: '#888', fontSize: '0.875rem' }}>No drones online</div>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {sorted.map((drone) => {
        const isSelected = drone.droneId === selectedId;
        const statusColor =
          drone.status === 'active' ? '#4ade80' : drone.status === 'idle' ? '#facc15' : '#94a3b8';
        return (
          <li
            key={drone.droneId}
            onClick={() => selectDrone(drone.droneId)}
            style={{
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              backgroundColor: isSelected ? '#e2e8f0' : 'transparent',
              borderLeft: `3px solid ${statusColor}`,
              marginBottom: 2,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              {nameMap.get(drone.droneId) ?? drone.droneId}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#666',
                display: 'flex',
                gap: '0.5rem',
              }}
            >
              <span style={{ color: statusColor }}>● {drone.status}</span>
              <span>{drone.battery_pct.toFixed(0)}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose DroneList
```

Expected: `4 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/DroneList.tsx apps/web/src/__tests__/DroneList.test.tsx
git commit -m "feat(web): implement DroneList sidebar component"
```

---

## Task 6: Map component

**Files:**

- Modify: `apps/web/src/components/Map.tsx` (replace stub)
- Create: `apps/web/src/__tests__/Map.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/__tests__/Map.test.tsx`:

```tsx
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '@fleet-tracker/shared';
import { useDroneStore } from '../lib/droneStore';

// Stub TanStack Query
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
}));

// Mock maplibre-gl — no WebGL available in happy-dom
const mockSetData = vi.fn();
const mockGetSource = vi.fn().mockReturnValue({ setData: mockSetData });
const mockAddSource = vi.fn();
const mockAddLayer = vi.fn();
const mockRemove = vi.fn();
const mockGetCanvas = vi.fn().mockReturnValue({ style: {} });
const mockQueryRenderedFeatures = vi.fn().mockReturnValue([]);

// MockMap fires 'load' synchronously when map.on('load', cb) is called
const MockMap = vi.fn().mockImplementation(() => ({
  on: vi.fn((event: string, cb: () => void) => {
    if (event === 'load') cb();
  }),
  remove: mockRemove,
  addSource: mockAddSource,
  addLayer: mockAddLayer,
  getSource: mockGetSource,
  getCanvas: mockGetCanvas,
  queryRenderedFeatures: mockQueryRenderedFeatures,
}));

const mockPopupRemove = vi.fn();
const mockPopupAddTo = vi.fn().mockReturnThis();
const mockPopupSetLngLat = vi.fn().mockReturnThis();
const mockPopupSetHTML = vi.fn().mockReturnThis();
const mockPopupOn = vi.fn().mockReturnThis();
const MockPopup = vi.fn().mockImplementation(() => ({
  setLngLat: mockPopupSetLngLat,
  setHTML: mockPopupSetHTML,
  addTo: mockPopupAddTo,
  on: mockPopupOn,
  remove: mockPopupRemove,
}));

vi.mock('maplibre-gl', () => ({
  default: { Map: MockMap, Popup: MockPopup },
  Map: MockMap,
  Popup: MockPopup,
}));

import { Map as DroneMap } from '../components/Map';

const s1: StateSnapshot = {
  droneId: 'd1',
  ts: 1,
  lat: 50.4,
  lng: 30.5,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
  status: 'active',
};

describe('Map', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDroneStore.setState({ drones: new Map(), selectedId: null });
  });
  afterEach(() => {
    cleanup();
  });

  it('initialises MapLibre map on mount', () => {
    render(<DroneMap />);
    expect(MockMap).toHaveBeenCalledOnce();
  });

  it('adds drones source and layer on load', () => {
    render(<DroneMap />);
    expect(mockAddSource).toHaveBeenCalledWith(
      'drones',
      expect.objectContaining({ type: 'geojson' }),
    );
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'drones', type: 'circle' }),
    );
  });

  it('calls setData with current drones when drones change', () => {
    render(<DroneMap />);
    mockSetData.mockClear();
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    expect(mockSetData).toHaveBeenCalledOnce();
    const arg = mockSetData.mock.calls[0][0] as { type: string; features: unknown[] };
    expect(arg.type).toBe('FeatureCollection');
    expect(arg.features).toHaveLength(1);
  });

  it('shows popup when selectedId is set to an existing drone', () => {
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    render(<DroneMap />);
    useDroneStore.getState().selectDrone('d1');
    expect(MockPopup).toHaveBeenCalled();
    expect(mockPopupSetLngLat).toHaveBeenCalledWith([s1.lng, s1.lat]);
    expect(mockPopupAddTo).toHaveBeenCalled();
  });

  it('removes popup when selectedId is cleared', () => {
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    render(<DroneMap />);
    useDroneStore.getState().selectDrone('d1');
    mockPopupRemove.mockClear();
    useDroneStore.getState().selectDrone(null);
    expect(mockPopupRemove).toHaveBeenCalled();
  });

  it('removes MapLibre map on unmount', () => {
    const { unmount } = render(<DroneMap />);
    unmount();
    expect(mockRemove).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose "Map.test"
```

Expected: fails — stub `Map` renders `<div id="map" ...>` but does no MapLibre logic.

- [ ] **Step 3: Implement Map.tsx**

Replace `apps/web/src/components/Map.tsx`:

```tsx
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StateSnapshot } from '@fleet-tracker/shared';
import type { DroneResponse } from '../lib/api.js';
import { api } from '../lib/api.js';
import { useDroneStore } from '../lib/droneStore.js';

const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

function toFeatureCollection(drones: Map<string, StateSnapshot>) {
  return {
    type: 'FeatureCollection' as const,
    features: [...drones.values()].map((d) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [d.lng, d.lat] },
      properties: {
        droneId: d.droneId,
        status: d.status,
        battery_pct: d.battery_pct,
        speed_mps: d.speed_mps,
        altitude_m: d.altitude_m,
        heading_deg: d.heading_deg,
      },
    })),
  };
}

function buildPopupHtml(drone: StateSnapshot, name: string): string {
  const statusColor =
    drone.status === 'active' ? '#4ade80' : drone.status === 'idle' ? '#facc15' : '#94a3b8';
  return `
    <div style="font-family:sans-serif;font-size:13px;min-width:160px">
      <div style="font-weight:700;margin-bottom:4px">${name}</div>
      <div style="color:${statusColor};margin-bottom:8px">● ${drone.status}</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#888;padding-right:8px">battery</td><td>${drone.battery_pct.toFixed(0)}%</td></tr>
        <tr><td style="color:#888;padding-right:8px">speed</td><td>${drone.speed_mps.toFixed(1)} m/s</td></tr>
        <tr><td style="color:#888;padding-right:8px">altitude</td><td>${drone.altitude_m.toFixed(0)} m</td></tr>
        <tr><td style="color:#888;padding-right:8px">heading</td><td>${drone.heading_deg.toFixed(0)}°</td></tr>
      </table>
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid #eee">
        <a href="/drones/${drone.droneId}/history"
           style="color:#3b82f6;text-decoration:none;font-size:12px">
          View history →
        </a>
      </div>
    </div>
  `;
}

export function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const isMapReadyRef = useRef(false);

  const drones = useDroneStore((s) => s.drones);
  const selectedId = useDroneStore((s) => s.selectedId);
  const selectDrone = useDroneStore((s) => s.selectDrone);

  const { data: droneList = [] } = useQuery<DroneResponse[]>({
    queryKey: ['drones'],
    queryFn: api.drones.list,
    staleTime: 10 * 60 * 1000,
  });

  const nameMap = useMemo(
    () => new Map<string, string>(droneList.map((d) => [d.id, d.name])),
    [droneList],
  );

  // ── Init map — runs exactly once ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [30.52, 50.45], // Kyiv default
      zoom: 10,
    });

    map.on('load', () => {
      map.addSource('drones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'drones',
        type: 'circle',
        source: 'drones',
        paint: {
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-color': [
            'match',
            ['get', 'status'],
            'active',
            '#4ade80',
            'idle',
            '#facc15',
            /* else */ '#94a3b8',
          ],
        },
      });

      // Click on a drone marker
      map.on('click', 'drones', (e) => {
        const feature = e.features?.[0];
        const droneId = feature?.properties?.droneId as string | undefined;
        if (droneId) selectDrone(droneId);
      });

      // Click on empty map area deselects
      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['drones'] });
        if (hits.length === 0) selectDrone(null);
      });

      map.on('mouseenter', 'drones', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'drones', () => {
        map.getCanvas().style.cursor = '';
      });

      isMapReadyRef.current = true;
    });

    map.on('error', (e) => {
      console.warn('[Map] MapLibre error', e);
    });

    mapRef.current = map;
    return () => {
      isMapReadyRef.current = false;
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync GeoJSON when drone state changes ───────────────────────────────────
  useEffect(() => {
    if (!isMapReadyRef.current || !mapRef.current) return;
    const src = mapRef.current.getSource('drones') as maplibregl.GeoJSONSource | undefined;
    src?.setData(toFeatureCollection(drones));
  }, [drones]);

  // ── Create popup when a drone is selected ──────────────────────────────────
  useEffect(() => {
    popupRef.current?.remove();
    popupRef.current = null;

    if (!selectedId || !mapRef.current || !isMapReadyRef.current) return;

    const drone = drones.get(selectedId);
    if (!drone) {
      selectDrone(null);
      return;
    }

    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
      .setLngLat([drone.lng, drone.lat])
      .setHTML(buildPopupHtml(drone, nameMap.get(selectedId) ?? selectedId))
      .addTo(mapRef.current);

    popup.on('close', () => selectDrone(null));
    popupRef.current = popup;
  }, [selectedId, drones, nameMap, selectDrone]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @fleet-tracker/web test -- --reporter=verbose "Map.test"
```

Expected: `6 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Map.tsx apps/web/src/__tests__/Map.test.tsx
git commit -m "feat(web): implement Map component — MapLibre GeoJSON layer, popup, drone select"
```

---

## Task 7: Wire Dashboard + delete DroneMarker

**Files:**

- Modify: `apps/web/src/pages/Dashboard.tsx`
- Delete: `apps/web/src/components/DroneMarker.tsx`

- [ ] **Step 1: Mount useFleetWS in Dashboard**

Replace `apps/web/src/pages/Dashboard.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { DroneList } from '../components/DroneList';
import { Map } from '../components/Map';
import { useAuthStore } from '../lib/auth';
import { useFleetWS } from '../lib/useFleetWS.js';

export function Dashboard() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);

  useFleetWS(token);

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

- [ ] **Step 2: Delete DroneMarker.tsx**

```bash
rm apps/web/src/components/DroneMarker.tsx
```

- [ ] **Step 3: Verify full test suite passes**

```bash
pnpm --filter @fleet-tracker/web test
```

Expected: all tests pass. If any test imports `DroneMarker`, remove or update that import.

- [ ] **Step 4: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: `0 errors`, `0 lint errors`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Dashboard.tsx
git rm apps/web/src/components/DroneMarker.tsx
git commit -m "feat(web): wire useFleetWS into Dashboard, remove DroneMarker stub"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run complete test suite**

```bash
pnpm test
```

Expected: all workspaces pass. Note the new total count (should be ~195+ tests).

- [ ] **Step 2: Typecheck all workspaces**

```bash
pnpm typecheck
```

Expected: `0 errors` across all workspaces.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test (optional but recommended)**

```bash
docker-compose up -d
pnpm --filter api db:migrate
pnpm --filter api dev &
pnpm --filter emulator start   # provisions drones + connects
pnpm --filter web dev
```

Open `http://localhost:5173`, log in, verify:

- Drone markers appear on the Kyiv map
- Markers move at ~1 Hz
- Clicking a marker opens the popup with telemetry
- Sidebar lists drones with status colour and battery
- Clicking a sidebar row selects the drone (popup opens)
- Logout works

- [ ] **Step 5: Update PROGRESS.md**

Mark `v1 Step 14` complete. Set next step to `v1 Step 15 — History view (replay path on map)`. Add session log entry for today.

- [ ] **Step 6: Final commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: mark v1 Step 14 done in PROGRESS.md"
```
