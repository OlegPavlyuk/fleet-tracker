# History View (v1 Step 15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `History.tsx` stub with a fully functional drone flight-path history page — time range picker (preset + custom), REST fetch via existing `/telemetry/history` API, static GeoJSON line + start/end markers on a MapLibre map, and a derived stats panel.

**Architecture:** Two new files only — `HistoryMap.tsx` (pure display component: MapLibre lifecycle, `line` layer, start/end `Marker` instances) and `History.tsx` (page: time range state, TanStack Query fetch, derived stats, loading/error/empty states). Zero changes to existing files.

**Tech Stack:** React 18, MapLibre GL JS, TanStack Query v5, react-router-dom v6, TypeScript strict, Vitest + happy-dom + React Testing Library.

---

## File Map

| Action  | Path                                         | Purpose                                      |
| ------- | -------------------------------------------- | -------------------------------------------- |
| Create  | `apps/web/src/components/HistoryMap.tsx`     | MapLibre map: line path + start/end markers  |
| Create  | `apps/web/src/__tests__/HistoryMap.test.tsx` | Unit tests for HistoryMap                    |
| Replace | `apps/web/src/pages/History.tsx`             | Page: time range state, query, stats, layout |
| Create  | `apps/web/src/__tests__/History.test.tsx`    | Unit tests for History page                  |

---

### Task 1: `HistoryMap` component — init, path rendering, markers, cleanup

**Files:**

- Create: `apps/web/src/__tests__/HistoryMap.test.tsx`
- Create: `apps/web/src/components/HistoryMap.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/__tests__/HistoryMap.test.tsx`:

```tsx
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryPoint } from '../lib/api';

// vi.hoisted ensures mock vars are available when vi.mock factory runs.
// Use regular functions (not arrow functions) so Reflect.construct works
// with vitest 4.x when called via 'new maplibregl.Map()' / 'new maplibregl.Marker()'.
const {
  mockSetData,
  mockAddSource,
  mockAddLayer,
  mockFitBounds,
  mockRemove,
  MockMap,
  MockMarker,
  mockMarkerRemove,
  mockMarkerSetLngLat,
  mockMarkerAddTo,
} = vi.hoisted(() => {
  const mockSetData = vi.fn();
  const mockAddSource = vi.fn();
  const mockAddLayer = vi.fn();
  const mockFitBounds = vi.fn();
  const mockRemove = vi.fn();
  const mockGetSource = vi.fn().mockReturnValue({ setData: mockSetData });

  const MockMap = vi.fn(function () {
    return {
      on: vi.fn(function (event: string, cb: () => void) {
        if (event === 'load') cb();
      }),
      remove: mockRemove,
      addSource: mockAddSource,
      addLayer: mockAddLayer,
      getSource: mockGetSource,
      fitBounds: mockFitBounds,
    };
  });

  const mockMarkerRemove = vi.fn();
  const mockMarkerSetLngLat = vi.fn().mockReturnThis();
  const mockMarkerAddTo = vi.fn().mockReturnThis();

  const MockMarker = vi.fn(function () {
    return {
      setLngLat: mockMarkerSetLngLat,
      addTo: mockMarkerAddTo,
      remove: mockMarkerRemove,
    };
  });

  return {
    mockSetData,
    mockAddSource,
    mockAddLayer,
    mockFitBounds,
    mockRemove,
    MockMap,
    MockMarker,
    mockMarkerRemove,
    mockMarkerSetLngLat,
    mockMarkerAddTo,
  };
});

vi.mock('maplibre-gl', () => ({
  default: { Map: MockMap, Marker: MockMarker },
  Map: MockMap,
  Marker: MockMarker,
}));

import { HistoryMap } from '../components/HistoryMap';

const p1: HistoryPoint = {
  ts: 1000,
  lat: 50.4,
  lng: 30.5,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
};
const p2: HistoryPoint = {
  ts: 61000,
  lat: 50.5,
  lng: 30.6,
  altitude_m: 110,
  heading_deg: 90,
  speed_mps: 12,
  battery_pct: 78,
};

describe('HistoryMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('initialises MapLibre map on mount', () => {
    render(<HistoryMap points={[]} />);
    expect(MockMap).toHaveBeenCalledOnce();
  });

  it('adds history-path source and history-line layer on load', () => {
    render(<HistoryMap points={[]} />);
    expect(mockAddSource).toHaveBeenCalledWith(
      'history-path',
      expect.objectContaining({ type: 'geojson' }),
    );
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'history-line', type: 'line' }),
    );
  });

  it('calls map.remove() on unmount', () => {
    const { unmount } = render(<HistoryMap points={[]} />);
    unmount();
    expect(mockRemove).toHaveBeenCalledOnce();
  });

  it('calls setData with empty FeatureCollection when points is empty', () => {
    render(<HistoryMap points={[]} />);
    const arg = mockSetData.mock.calls[0]?.[0] as {
      type: string;
      features: unknown[];
    };
    expect(arg?.type).toBe('FeatureCollection');
    expect(arg?.features).toHaveLength(0);
  });

  it('does NOT call fitBounds when points is empty', () => {
    render(<HistoryMap points={[]} />);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('does NOT call fitBounds when only 1 point given', () => {
    render(<HistoryMap points={[p1]} />);
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('calls setData with LineString when 2+ points provided', () => {
    render(<HistoryMap points={[p1, p2]} />);
    const arg = mockSetData.mock.calls[0]?.[0] as {
      type: string;
      features: Array<{ geometry: { type: string; coordinates: number[][] } }>;
    };
    expect(arg?.features[0]?.geometry.type).toBe('LineString');
    expect(arg?.features[0]?.geometry.coordinates).toEqual([
      [p1.lng, p1.lat],
      [p2.lng, p2.lat],
    ]);
  });

  it('calls fitBounds with padding 60 and maxZoom 15 when 2+ points given', () => {
    render(<HistoryMap points={[p1, p2]} />);
    expect(mockFitBounds).toHaveBeenCalledOnce();
    expect(mockFitBounds).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ padding: 60, maxZoom: 15 }),
    );
  });

  it('creates start and end markers (setLngLat + addTo called twice) when 2+ points given', () => {
    render(<HistoryMap points={[p1, p2]} />);
    expect(MockMarker).toHaveBeenCalledTimes(2);
    expect(mockMarkerSetLngLat).toHaveBeenCalledWith([p1.lng, p1.lat]);
    expect(mockMarkerSetLngLat).toHaveBeenCalledWith([p2.lng, p2.lat]);
    expect(mockMarkerAddTo).toHaveBeenCalledTimes(2);
  });

  it('removes both markers on unmount', () => {
    const { unmount } = render(<HistoryMap points={[p1, p2]} />);
    unmount();
    expect(mockMarkerRemove).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm --filter web test --reporter=verbose src/__tests__/HistoryMap.test.tsx
```

Expected: multiple FAIL (module not found / cannot import `HistoryMap`).

- [ ] **Step 3: Implement `HistoryMap.tsx`**

Create `apps/web/src/components/HistoryMap.tsx`:

```tsx
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { HistoryPoint } from '../lib/api.js';

const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

interface HistoryMapProps {
  points: HistoryPoint[];
}

export function HistoryMap({ points }: HistoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapReadyRef = useRef(false);
  const markersRef = useRef<{
    start: maplibregl.Marker | null;
    end: maplibregl.Marker | null;
  }>({ start: null, end: null });

  // ── Init map — runs exactly once ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [30.52, 50.45],
      zoom: 10,
    });

    map.on('load', () => {
      map.addSource('history-path', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'history-line',
        type: 'line',
        source: 'history-path',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 3 },
      });

      isMapReadyRef.current = true;
    });

    map.on('error', (e) => {
      console.warn('[HistoryMap] MapLibre error', e);
    });

    mapRef.current = map;

    return () => {
      isMapReadyRef.current = false;
      markersRef.current.start?.remove();
      markersRef.current.end?.remove();
      markersRef.current = { start: null, end: null };
      map.remove();
    };
  }, []);

  // ── Sync path when points change ────────────────────────────────────────────
  // Note: the mock calls map.on('load', cb) synchronously, so isMapReadyRef is
  // true before this effect runs in tests. In production the map loads fast
  // enough that points (a network round-trip away) arrive after the map is ready.
  useEffect(() => {
    if (!isMapReadyRef.current || !mapRef.current) return;

    const map = mapRef.current;
    const src = map.getSource('history-path');
    if (!src || !('setData' in src)) return;

    const geoSrc = src as maplibregl.GeoJSONSource;

    if (points.length === 0) {
      geoSrc.setData({ type: 'FeatureCollection', features: [] });
      markersRef.current.start?.remove();
      markersRef.current.end?.remove();
      markersRef.current = { start: null, end: null };
      return;
    }

    const coordinates = points.map((p) => [p.lng, p.lat] as [number, number]);

    geoSrc.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {},
        },
      ],
    });

    const first = points[0]!;
    const last = points[points.length - 1]!;

    // Reuse markers if they already exist (points updated, not first render)
    if (markersRef.current.start) {
      markersRef.current.start.setLngLat([first.lng, first.lat]);
    } else {
      markersRef.current.start = new maplibregl.Marker({ color: '#4ade80' })
        .setLngLat([first.lng, first.lat])
        .addTo(map);
    }

    if (markersRef.current.end) {
      markersRef.current.end.setLngLat([last.lng, last.lat]);
    } else {
      markersRef.current.end = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat([last.lng, last.lat])
        .addTo(map);
    }

    if (points.length >= 2) {
      const lngs = points.map((p) => p.lng);
      const lats = points.map((p) => p.lat);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 60, maxZoom: 15 },
      );
    }
  }, [points]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pnpm --filter web test --reporter=verbose src/__tests__/HistoryMap.test.tsx
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/HistoryMap.tsx apps/web/src/__tests__/HistoryMap.test.tsx
git commit -m "feat(web): add HistoryMap component — MapLibre line path, start/end markers, fitBounds"
```

---

### Task 2: `History` page — time range controls, query, stats, loading/error states

**Files:**

- Create: `apps/web/src/__tests__/History.test.tsx`
- Replace: `apps/web/src/pages/History.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/__tests__/History.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { HistoryPoint } from '../lib/api';
import type { DroneResponse } from '../lib/api';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'drone-abc' }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

// Mock HistoryMap to avoid maplibre-gl dependency in History tests
vi.mock('../components/HistoryMap', () => ({
  HistoryMap: ({ points }: { points: HistoryPoint[] }) => (
    <div data-testid="history-map" data-point-count={points.length} />
  ),
}));

const mockRefetch = vi.fn();
const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: mockUseQuery,
}));

import { History } from '../pages/History';

// Default: empty history, empty drone list — no loading, no error
function defaultQuery({ queryKey }: { queryKey: unknown[] }) {
  if (Array.isArray(queryKey) && queryKey[0] === 'history') {
    return {
      data: [] as HistoryPoint[],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
  }
  return { data: [] as DroneResponse[] };
}

// ── Time range controls ─────────────────────────────────────────────────────

describe('History — navigation and preset controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockImplementation(defaultQuery);
  });
  afterEach(() => {
    cleanup();
  });

  it('renders a Back to Dashboard link pointing to /', () => {
    render(<History />);
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('renders all preset buttons', () => {
    render(<History />);
    expect(screen.getByRole('button', { name: /last 5m/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /last 15m/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /last 1h/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /last 24h/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /custom/i })).toBeTruthy();
  });

  it('does not show datetime inputs in default (preset) mode', () => {
    render(<History />);
    expect(screen.queryByLabelText('From')).toBeNull();
    expect(screen.queryByLabelText('To')).toBeNull();
  });

  it('shows datetime inputs and Load button when Custom is selected', async () => {
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /custom/i }));
    expect(screen.getByLabelText('From')).toBeTruthy();
    expect(screen.getByLabelText('To')).toBeTruthy();
    expect(screen.getByRole('button', { name: /load/i })).toBeTruthy();
  });

  it('Load button is disabled when custom inputs are empty', async () => {
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /custom/i }));
    const btn = screen.getByRole('button', { name: /load/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('Load button is disabled when from >= to', async () => {
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /custom/i }));
    // from is later than to → invalid
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-04-15T12:00' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-04-15T10:00' },
    });
    const btn = screen.getByRole('button', { name: /load/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('Load button is enabled when from < to', async () => {
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /custom/i }));
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-04-15T10:00' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-04-15T12:00' },
    });
    const btn = screen.getByRole('button', { name: /load/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

// ── Loading / error / empty states ──────────────────────────────────────────

describe('History — loading, error, empty, and stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('shows loading indicator when history query is in flight', () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: [], isLoading: true, isError: false, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('shows error message and Retry button when history query fails', () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: [], isLoading: false, isError: true, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    expect(screen.getByText(/failed to load history/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('calls refetch when Retry is clicked', async () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: [], isLoading: false, isError: true, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it('shows "no telemetry found" message when 0 points returned with a valid range', () => {
    mockUseQuery.mockImplementation(defaultQuery);
    render(<History />);
    // Default preset '5m' is a valid range, and query returns []
    expect(screen.getByText(/no telemetry found/i)).toBeTruthy();
  });

  it('does not render stats bar when 0 points', () => {
    mockUseQuery.mockImplementation(defaultQuery);
    render(<History />);
    expect(screen.queryByText(/points/)).toBeNull();
  });

  it('shows point count with — for duration and battery when only 1 point', () => {
    const onePoint: HistoryPoint[] = [
      {
        ts: 1000,
        lat: 50.4,
        lng: 30.5,
        altitude_m: 100,
        heading_deg: 45,
        speed_mps: 10,
        battery_pct: 80,
      },
    ];
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: onePoint, isLoading: false, isError: false, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    expect(screen.getByText(/1.*points/i)).toBeTruthy();
    // Both duration and battery delta should show — for single-point dataset
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows correct stats for a 2-point result', () => {
    // 65 000 ms apart = 1m 5s; battery drop 80 → 78 = -2.0%
    const twoPoints: HistoryPoint[] = [
      {
        ts: 0,
        lat: 50.4,
        lng: 30.5,
        altitude_m: 100,
        heading_deg: 45,
        speed_mps: 10,
        battery_pct: 80,
      },
      {
        ts: 65000,
        lat: 50.5,
        lng: 30.6,
        altitude_m: 110,
        heading_deg: 90,
        speed_mps: 12,
        battery_pct: 78,
      },
    ];
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: twoPoints, isLoading: false, isError: false, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    expect(screen.getByText(/2.*points/i)).toBeTruthy();
    expect(screen.getByText('1m 5s')).toBeTruthy();
    expect(screen.getByText('-2.0%')).toBeTruthy();
  });

  it('shows drone name from the drone list when available', () => {
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: [], isLoading: false, isError: false, refetch: mockRefetch };
      }
      return {
        data: [
          {
            id: 'drone-abc',
            name: 'Alpha',
            ownerId: 'u1',
            model: 'X1',
            status: 'active',
            createdAt: '',
          } satisfies DroneResponse,
        ],
      };
    });
    render(<History />);
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('falls back to drone ID when drone list is empty', () => {
    mockUseQuery.mockImplementation(defaultQuery);
    render(<History />);
    expect(screen.getByText('drone-abc')).toBeTruthy();
  });

  it('renders HistoryMap with the correct point count', () => {
    const twoPoints: HistoryPoint[] = [
      {
        ts: 0,
        lat: 50.4,
        lng: 30.5,
        altitude_m: 100,
        heading_deg: 45,
        speed_mps: 10,
        battery_pct: 80,
      },
      {
        ts: 1000,
        lat: 50.5,
        lng: 30.6,
        altitude_m: 110,
        heading_deg: 90,
        speed_mps: 12,
        battery_pct: 79,
      },
    ];
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'history') {
        return { data: twoPoints, isLoading: false, isError: false, refetch: mockRefetch };
      }
      return { data: [] };
    });
    render(<History />);
    const map = screen.getByTestId('history-map');
    expect(map.getAttribute('data-point-count')).toBe('2');
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm --filter web test --reporter=verbose src/__tests__/History.test.tsx
```

Expected: multiple FAIL (History.tsx still a stub that returns `<p>History view — coming in Step 15</p>`).

- [ ] **Step 3: Implement `History.tsx`**

Replace `apps/web/src/pages/History.tsx` entirely:

```tsx
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DroneResponse, HistoryPoint } from '../lib/api.js';
import { api } from '../lib/api.js';
import { HistoryMap } from '../components/HistoryMap.js';

// ── Time range ──────────────────────────────────────────────────────────────

type Preset = '5m' | '15m' | '1h' | '24h' | 'custom';

const PRESETS: Record<Exclude<Preset, 'custom'>, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
}

// ── Page component ──────────────────────────────────────────────────────────

export function History() {
  const { id: droneId = '' } = useParams<{ id: string }>();

  const [preset, setPreset] = useState<Preset>('5m');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customRange, setCustomRange] = useState<{ from: number; to: number } | null>(null);

  // Capture timestamp once per preset change — prevents query key drift on re-renders
  const presetRange = useMemo(() => {
    if (preset === 'custom') return null;
    const to = Date.now();
    return { from: to - PRESETS[preset], to };
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const from = preset !== 'custom' ? (presetRange?.from ?? 0) : (customRange?.from ?? 0);
  const to = preset !== 'custom' ? (presetRange?.to ?? 0) : (customRange?.to ?? 0);
  const isValidRange = from > 0 && to > 0 && from < to;

  // Custom range validation (before clicking Load)
  const customFromMs = customFrom ? new Date(customFrom).getTime() : 0;
  const customToMs = customTo ? new Date(customTo).getTime() : 0;
  const isCustomValid = customFromMs > 0 && customToMs > 0 && customFromMs < customToMs;

  // Drone name lookup (cached from Dashboard — staleTime 10 min)
  const { data: droneList = [] } = useQuery<DroneResponse[]>({
    queryKey: ['drones'],
    queryFn: api.drones.list,
    staleTime: 10 * 60 * 1000,
  });
  const droneName = droneList.find((d) => d.id === droneId)?.name ?? droneId;

  // History fetch — only runs when range is valid
  const {
    data: points = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<HistoryPoint[]>({
    queryKey: ['history', droneId, from, to],
    queryFn: () => api.telemetry.history({ drone_id: droneId, from, to }),
    enabled: isValidRange,
  });

  // Derived stats — computed from points, not inside HistoryMap
  const stats = useMemo(() => {
    if (points.length < 1) return null;
    return {
      count: points.length,
      timeSpan:
        points.length >= 2 ? formatDuration(points[points.length - 1]!.ts - points[0]!.ts) : '—',
      batteryDelta:
        points.length >= 2
          ? `-${(points[0]!.battery_pct - points[points.length - 1]!.battery_pct).toFixed(1)}%`
          : '—',
    };
  }, [points]);

  function handleLoadCustom() {
    if (!isCustomValid) return;
    setCustomRange({ from: customFromMs, to: customToMs });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #ccc',
        }}
      >
        <Link to="/">← Back to Dashboard</Link>
        <span style={{ fontWeight: 700 }}>{droneName}</span>
        <span style={{ color: '#888' }}>Flight History</span>
      </header>

      {/* Time range controls */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #eee',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {(['5m', '15m', '1h', '24h'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            style={{ fontWeight: preset === p ? 700 : 400 }}
          >
            Last {p}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          style={{ fontWeight: preset === 'custom' ? 700 : 400 }}
        >
          Custom
        </button>

        {preset === 'custom' && (
          <>
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label="From"
            />
            <input
              type="datetime-local"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label="To"
            />
            <button onClick={handleLoadCustom} disabled={!isCustomValid}>
              Load
            </button>
            {customFrom && customTo && !isCustomValid && (
              <span style={{ color: '#ef4444', fontSize: 12 }}>"From" must be before "To"</span>
            )}
          </>
        )}
      </div>

      {/* Stats bar — only when we have at least 1 point */}
      {stats && (
        <div
          style={{
            display: 'flex',
            gap: '2rem',
            padding: '0.5rem 1rem',
            background: '#f9f9f9',
            borderBottom: '1px solid #eee',
            fontSize: 13,
          }}
        >
          <span>
            <b>{stats.count}</b> points
          </span>
          <span>
            Duration: <b>{stats.timeSpan}</b>
          </span>
          <span>
            Battery used: <b>{stats.batteryDelta}</b>
          </span>
        </div>
      )}

      {/* Map area */}
      <main style={{ flex: 1, position: 'relative' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.8)',
              zIndex: 10,
            }}
          >
            Loading…
          </div>
        )}
        {isError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <p>Failed to load history.</p>
            <button onClick={() => void refetch()}>Retry</button>
          </div>
        )}
        {!isLoading && !isError && points.length === 0 && isValidRange && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            No telemetry found for this time range.
          </div>
        )}
        <HistoryMap points={points} />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pnpm --filter web test --reporter=verbose src/__tests__/History.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/History.tsx apps/web/src/__tests__/History.test.tsx
git commit -m "feat(web): implement History page — time range controls, query, stats, loading/error states"
```

---

### Task 3: Final verification and PROGRESS.md update

**Files:**

- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Run full web test suite**

```bash
pnpm --filter web test
```

Expected: all tests pass. Total count should be ~210+ (was 192 before this step).

- [ ] **Step 2: Run typecheck across all workspaces**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: 0 errors (warnings OK).

- [ ] **Step 4: Update `docs/PROGRESS.md`**

Make these changes to `docs/PROGRESS.md`:

1. Change "Current step" line to:

   ```
   - **Current step**: ready to start v1 Step 16 — Tests (unit + integration + WS contract + smoke E2E)
   ```

2. Change "Last session" line to:

   ```
   - **Last session**: 2026-04-15 — v1 Step 15 complete
   ```

3. In the "Next up" list, mark Step 15 as done:

   ```
   - [x] **v1 Step 15**: History view (replay path on map)
   ```

4. Prepend a new entry to the "Session log (most recent first)" section:

   ```markdown
   ### 2026-04-15 (session 6)

   - Completed v1 Step 15: History view
   - `HistoryMap.tsx` — MapLibre GeoJSON LineString layer (`history-path` source, `history-line` layer), start marker (green `#4ade80`) + end marker (red `#ef4444`) stored in refs and reused on prop update, `fitBounds` with `padding:60, maxZoom:15` when ≥2 points, no fitBounds on 0/1 points, `map.remove()` + marker cleanup on unmount
   - `History.tsx` — preset buttons (5m/15m/1h/24h) + Custom mode with datetime-local inputs, `useMemo([preset])` captures stable `from`/`to` timestamps once per preset change (prevents query key drift), Load button disabled when `from >= to`, TanStack Query `useQuery(['history', droneId, from, to])` enabled only when range is valid, derived stats (count / duration / battery delta) with `—` guards for <2 points, loading overlay, error + retry, empty message, drone name from cached drone list
   - N new tests (NNN total), 0 type errors, 0 lint errors
   - Next: v1 Step 16 — Tests (unit + integration + WS contract + smoke E2E)
   ```

   _(Fill in actual test counts after running `pnpm --filter web test`.)_

- [ ] **Step 5: Commit PROGRESS.md**

```bash
git add docs/PROGRESS.md
git commit -m "docs: mark v1 Step 15 done in PROGRESS.md"
```
