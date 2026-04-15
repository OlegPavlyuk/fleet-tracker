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
