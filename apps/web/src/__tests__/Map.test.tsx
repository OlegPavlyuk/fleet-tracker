import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '@fleet-tracker/shared';
import { useDroneStore } from '../lib/droneStore';

// Stub TanStack Query
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
}));

// vi.hoisted ensures mocks are available when vi.mock factory runs.
// Only export vars used in test assertions; the rest stay captured in closures.
const {
  mockSetData,
  mockAddSource,
  mockAddLayer,
  mockRemove,
  MockMap,
  mockPopupRemove,
  mockPopupAddTo,
  mockPopupSetLngLat,
  MockPopup,
} = vi.hoisted(() => {
  const mockSetData = vi.fn();
  const mockGetSource = vi.fn().mockReturnValue({ setData: mockSetData });
  const mockAddSource = vi.fn();
  const mockAddLayer = vi.fn();
  const mockRemove = vi.fn();
  const mockGetCanvas = vi.fn().mockReturnValue({ style: {} });
  const mockQueryRenderedFeatures = vi.fn().mockReturnValue([]);

  // Use regular functions (not arrow functions) so Reflect.construct works with
  // vitest 4.x when called via 'new maplibregl.Map()' / 'new maplibregl.Popup()'
  const MockMap = vi.fn(function () {
    return {
      on: vi.fn(function (event: string, cb: () => void) {
        if (event === 'load') cb();
      }),
      remove: mockRemove,
      addSource: mockAddSource,
      addLayer: mockAddLayer,
      getSource: mockGetSource,
      getCanvas: mockGetCanvas,
      queryRenderedFeatures: mockQueryRenderedFeatures,
    };
  });

  const mockPopupRemove = vi.fn();
  const mockPopupAddTo = vi.fn().mockReturnThis();
  const mockPopupSetLngLat = vi.fn().mockReturnThis();
  const mockPopupSetHTML = vi.fn().mockReturnThis();
  const mockPopupOn = vi.fn().mockReturnThis();
  const MockPopup = vi.fn(function () {
    return {
      setLngLat: mockPopupSetLngLat,
      setHTML: mockPopupSetHTML,
      addTo: mockPopupAddTo,
      on: mockPopupOn,
      remove: mockPopupRemove,
    };
  });

  return {
    mockSetData,
    mockAddSource,
    mockAddLayer,
    mockRemove,
    MockMap,
    mockPopupRemove,
    mockPopupAddTo,
    mockPopupSetLngLat,
    MockPopup,
  };
});

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
    act(() => {
      useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    });
    expect(mockSetData).toHaveBeenCalledOnce();
    const arg = mockSetData.mock.calls[0]![0] as { type: string; features: unknown[] };
    expect(arg.type).toBe('FeatureCollection');
    expect(arg.features).toHaveLength(1);
  });

  it('shows popup when selectedId is set to an existing drone', () => {
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    render(<DroneMap />);
    act(() => {
      useDroneStore.getState().selectDrone('d1');
    });
    expect(MockPopup).toHaveBeenCalled();
    expect(mockPopupSetLngLat).toHaveBeenCalledWith([s1.lng, s1.lat]);
    expect(mockPopupAddTo).toHaveBeenCalled();
  });

  it('removes popup when selectedId is cleared', () => {
    useDroneStore.setState({ drones: new Map([['d1', s1]]) });
    render(<DroneMap />);
    act(() => {
      useDroneStore.getState().selectDrone('d1');
    });
    mockPopupRemove.mockClear();
    act(() => {
      useDroneStore.getState().selectDrone(null);
    });
    expect(mockPopupRemove).toHaveBeenCalled();
  });

  it('removes MapLibre map on unmount', () => {
    const { unmount } = render(<DroneMap />);
    unmount();
    expect(mockRemove).toHaveBeenCalledOnce();
  });
});
